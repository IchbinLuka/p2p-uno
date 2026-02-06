import {
    ConnectionManagerImpl,
    ConnectionRouter,
    MessageType,
    type ConnectionManager,
    type DrawCardRequest,
    type FinalizeCardDraw,
    type PlayCard,
    type SignCardMessage,
    type SkipTurn,
} from "./connection";
import { DrawingCard, GameManager, WaitingPhase } from "./game";
import {
    ConnectionEstablishHandler,
    type ConnectionResult,
    type PlayerStatus,
} from "./ice_messaging";
import { SignManager } from "./signing";
import type { CardType, KnownCard, PlayerGame } from "./types";
import { ValueNotifier } from "./util";

export interface UICard {
    card_type: CardType;
    uuid: string;
}

export interface GameState {
    current_player: string;
    player_card_counts: Record<string, number>;
    own_cards: UICard[];
    top_card: CardType | null;
}

export type Preparing = "preparing";

export class GameRunning {
    private readonly game_manager: GameManager;
    private readonly connection_manager: ConnectionManager;
    private readonly sign_manager: SignManager;
    readonly own_name: string;
    private readonly player_order: string[];
    private readonly self_idx: number;
    own_cards: Record<string, KnownCard> = {};

    state: ValueNotifier<GameState | Preparing> = new ValueNotifier<
        GameState | Preparing
    >("preparing");

    constructor(
        connection_result: ConnectionResult,
        sign_manager: SignManager,
        own_name: string,
    ) {
        this.own_name = own_name;
        this.sign_manager = sign_manager;
        const players: Record<string, PlayerGame> = {};
        for (const player of connection_result.players) {
            players[player.name] = {
                cards: {},
                name: player.name,
                public_key: player.public_key,
            };
        }
        this.connection_manager = new ConnectionManagerImpl(
            new ConnectionRouter(
                connection_result.players
                    .filter((p) => p.data_channel != null)
                    .map((p) => {
                        return {
                            player: p.name,
                            channel: p.data_channel!,
                        };
                    }),
                sign_manager,
                players,
            ),
        );
        this.connection_manager.add_manual_message_resolver(
            this.own_name,
            MessageType.DRAW_CARD_REQUEST,
            async () => await this.draw_card(),
        );
        this.connection_manager.add_manual_message_resolver(
            this.own_name,
            MessageType.PLAY_CARD,
            async () => await this.play_card(this.own_cards[0]),
        );
        this.connection_manager.add_manual_message_resolver(
            this.own_name,
            MessageType.SIGN_CARD,
            async () => await this.sign_card(),
        );
        this.player_order = connection_result.players.map((p) => p.name);
        this.self_idx = this.player_order.indexOf(this.own_name);
        this.game_manager = new GameManager(
            sign_manager,
            this.player_order,
            this.connection_manager,
            (_) => {},
            players,
        );
        this.game_manager.add_phase_listener((phase) => {
            if (phase instanceof WaitingPhase) {
                this.state.value = {
                    current_player: this.player_order[phase.current_player_idx],
                    top_card: phase.top_card,
                    player_card_counts: phase.player_card_counts,
                    own_cards: Object.values(this.own_cards),
                };
            }
        });
        this.run().catch((error) => {
            console.error("Error running game:", error);
        });
    }

    async run() {
        // We need to ensure that the connection managers for the other peers have
        // created before starting the game.
        // TODO: Find a solution for this race condition
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.game_manager.game_flow();
    }

    private async sign_card() {
        const phase = this.game_manager.get_state().phase;
        if (!(phase instanceof DrawingCard)) {
            console.error("Unexpected phase:", phase);
            return;
        }
        if (phase.next_player !== this.own_name) {
            console.error("Unexpected next player:", phase.next_player);
            return;
        }
        const signed = await this.sign_manager.signCard(
            phase.current_card,
            this.own_name,
        );
        const message: SignCardMessage = {
            type: MessageType.SIGN_CARD,
            signature:
                signed.signatures[signed.signatures.length - 1].signature,
        };
        this.connection_manager.manual_send(
            await this.sign_manager.signMessage(message, this.own_name),
        );
    }

    async draw_card() {
        console.debug("Drawing card");
        const initial_card = this.sign_manager.sampleCard();
        const message: DrawCardRequest = {
            type: MessageType.DRAW_CARD_REQUEST,
            initial_card,
        };

        this.connection_manager.manual_send(
            await this.sign_manager.signMessage(message, this.own_name),
        );

        const card = initial_card;

        for (let i = 1; i < this.player_order.length; i++) {
            const player =
                this.player_order[
                    (this.self_idx + i) % this.player_order.length
                ];
            console.log(`Waiting for signature from ${player}`);
            console.debug(
                `this.self_idx: ${this.self_idx}, player_idx: ${player}`,
            );
            const sign_message = (await this.connection_manager.await_message(
                player,
                [MessageType.SIGN_CARD],
            )) as SignCardMessage;

            card.signatures.push({
                signature: sign_message.signature,
                author: player,
            });
        }
        const signed_card = await this.sign_manager.signCard(
            card,
            this.own_name,
        );
        const final_card = await this.sign_manager.finalizeCard(
            signed_card,
            this.own_name,
        );
        this.own_cards[final_card.uuid] = final_card;
        const finalize_message: FinalizeCardDraw = {
            type: MessageType.FINALIZE_CARD_DRAW,
            card_hash: final_card.hash,
        };
        this.connection_manager.manual_send(
            await this.sign_manager.signMessage(
                finalize_message,
                this.own_name,
            ),
        );
    }

    async play_card(card: KnownCard) {
        const message: PlayCard = {
            type: MessageType.PLAY_CARD,
            card,
        };
        this.connection_manager.manual_send(
            await this.sign_manager.signMessage(message, this.own_name),
        );
        delete this.own_cards[card.uuid];
    }

    async skip_turn() {
        const nonce = new Uint8Array(32);
        window.crypto.getRandomValues(nonce);
        const message: SkipTurn = {
            type: MessageType.SKIP_TURN,
            nonce,
        };
        this.connection_manager.manual_send(
            await this.sign_manager.signMessage(message, this.own_name),
        );
    }
}

export class Waiting {
    private establish_handler: ConnectionEstablishHandler | null = null;
    private _current_players: PlayerStatus[] = [];

    private readonly listeners: Set<(players: PlayerStatus[]) => void> =
        new Set();

    public get current_players(): PlayerStatus[] {
        return this._current_players;
    }

    constructor(
        player_name: string,
        session_id: string,
        sign_manager: SignManager,
        on_game_start: (result: ConnectionResult) => void,
        on_error: (error: Error) => void,
    ) {
        const on_update = (state: PlayerStatus[]) => {
            this._current_players = state;
            // notify all subscribers
            for (const l of Array.from(this.listeners)) {
                try {
                    l(state);
                } catch (err) {
                    // Keep notifying other listeners even if one fails.
                    console.error("listener error", err);
                }
            }
        };
        ConnectionEstablishHandler.create(
            player_name,
            session_id,
            sign_manager,
            on_update,
            on_game_start,
        )
            .then((handler) => (this.establish_handler = handler))
            .catch((e: Error) => on_error(e));
    }

    /**
     * Subscribe to player updates. Returns an unsubscribe function.
     */
    subscribe(listener: (players: PlayerStatus[]) => void): () => void {
        this.listeners.add(listener);
        // Immediately call the listener with current state so subscribers don't need to wait.
        try {
            listener(this._current_players);
        } catch (err) {
            console.error("listener initial call error", err);
        }
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Unsubscribe a previously added listener.
     * Provided for convenience if the caller doesn't want the returned unsubscribe function.
     */
    unsubscribe(listener: (players: PlayerStatus[]) => void): void {
        this.listeners.delete(listener);
    }

    start_session() {
        this.establish_handler?.start_session();
    }
}

export type GamePhase = GameRunning | Waiting;

export class GameModel extends EventTarget {
    public static readonly PHASE_CHANGE: string = "phaseChange";

    private sign_manager: SignManager;

    game_phase: ValueNotifier<GamePhase | null> =
        new ValueNotifier<GamePhase | null>(null);

    private constructor(sign_manager: SignManager) {
        super();
        this.sign_manager = sign_manager;
    }

    static async create() {
        const sign_manager = await SignManager.init();
        return new GameModel(sign_manager);
    }

    join_session(player_name: string, session_id: string) {
        const on_game_start = (result: ConnectionResult) => {
            this.game_phase.value = new GameRunning(
                result,
                this.sign_manager,
                player_name,
            );
        };
        const on_error = (error: Error) => {
            console.error(error); // TODO
        };
        this.game_phase.value = new Waiting(
            player_name,
            session_id,
            this.sign_manager,
            on_game_start,
            on_error,
        );
    }
}
