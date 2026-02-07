import {
    ConnectionRouter,
    MessageType,
    type DrawCard,
    type FinalizeCardDraw,
    type Message,
    type PlayCard,
    type SignCardMessage,
    type SkipTurn,
} from "./connection";
import {
    DrawingCard,
    GameManager,
    Preparing,
    WaitingPhase,
    type GamePhase,
} from "./game";
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

export type GameStage = GameRunning | Waiting | GameFinished;

export type PreparingState = "preparing";

export class GameRunning {
    private readonly game_manager: GameManager;
    private readonly connection_router: ConnectionRouter;
    private readonly sign_manager: SignManager;
    // @ts-expect-error: This attribute is currently not accessed
    private message_job: Promise<void> | undefined;
    readonly own_name: string;
    private readonly player_order: string[];
    private readonly self_idx: number;
    private readonly on_finish: (winner: string) => void;
    own_cards: Record<string, KnownCard> = {};

    state: ValueNotifier<GameState | PreparingState> = new ValueNotifier<
        GameState | PreparingState
    >("preparing");

    constructor(
        connection_result: ConnectionResult,
        sign_manager: SignManager,
        own_name: string,
        on_finish: (winner: string) => void,
    ) {
        this.on_finish = on_finish;
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
        this.connection_router = new ConnectionRouter(
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
        );

        this.player_order = connection_result.players.map((p) => p.name);
        this.self_idx = this.player_order.indexOf(this.own_name);
        this.game_manager = new GameManager(
            sign_manager,
            this.player_order,
            (_) => {},
            players,
        );
    }

    run(): void {
        this.game_manager.add_phase_listener((phase) => {
            this.handle_phase(phase).catch((e) => {
                console.error(e);
            });
        });
        this.message_job = (async () => {
            while (true) {
                const message =
                    await this.connection_router.message_queue.dequeue();
                await this.game_manager.on_message(message);
            }
        })();
    }

    private async send_message(message: Message) {
        const player_message = await this.sign_manager.signMessage(
            message,
            this.own_name,
        );
        await this.game_manager.on_message(player_message);
        this.connection_router.distribute(player_message);
    }

    private async handle_phase(phase: GamePhase) {
        if (phase instanceof DrawingCard) {
            if (phase.next_player !== this.own_name) return;
            const signed = await this.sign_manager.signCard(
                phase.current_card,
                this.own_name,
            );
            if (phase.initiator === this.own_name) {
                const final_card = await this.sign_manager.finalizeCard(
                    signed,
                    this.own_name,
                );
                this.own_cards[final_card.uuid] = final_card;
                const finalize_message: FinalizeCardDraw = {
                    type: MessageType.FINALIZE_CARD_DRAW,
                    card_hash: final_card.hash,
                };
                await this.send_message(finalize_message);
            } else {
                const message: SignCardMessage = {
                    type: MessageType.SIGN_CARD,
                    signature:
                        signed.signatures[signed.signatures.length - 1]
                            .signature,
                };
                await this.send_message(message);
            }
        } else if (phase instanceof Preparing) {
            if (phase.current_player_idx !== this.self_idx) return;
            const initial_card = this.sign_manager.sampleCard();
            const message: DrawCard = {
                type: MessageType.DRAW_CARD_REQUEST,
                initial_card,
            };
            await this.send_message(message);
        } else if (phase instanceof WaitingPhase) {
            this.state.value = {
                current_player: this.player_order[phase.current_player_idx],
                player_card_counts: phase.player_card_counts,
                own_cards: Object.values(this.own_cards),
                top_card: phase.top_card,
            };
            if (
                phase.top_card == null &&
                phase.current_player_idx === this.self_idx
            ) {
                // We are still in the preparing phase, play out a card without confirmation
                await this.play_card(Object.values(this.own_cards)[0]);
            }
        } else {
            phase satisfies GameFinished;
            this.on_finish(phase.winner);
        }
    }

    async draw_card() {
        console.debug("Drawing card");
        const initial_card = this.sign_manager.sampleCard();
        const message: DrawCard = {
            type: MessageType.DRAW_CARD_REQUEST,
            initial_card,
        };
        await this.send_message(message);
    }

    async play_card(card: UICard) {
        if (this.state.value == "preparing") return;
        const known_card = this.own_cards[card.uuid];
        if (known_card == null) {
            throw new Error("Card not found");
        }
        const message: PlayCard = {
            type: MessageType.PLAY_CARD,
            card: known_card,
        };
        await this.send_message(message);
        // this.connection_manager.manual_send(
        //     await this.sign_manager.signMessage(message, this.own_name),
        // );
        delete this.own_cards[card.uuid];
        this.state.value = {
            ...this.state.value,
            own_cards: Object.values(this.own_cards),
        };
    }

    async skip_turn() {
        const nonce = new Uint8Array(32);
        window.crypto.getRandomValues(nonce);
        const message: SkipTurn = {
            type: MessageType.SKIP_TURN,
            nonce,
        };
        await this.send_message(message);
        // this.connection_manager.manual_send(
        //     await this.sign_manager.signMessage(message, this.own_name),
        // );
    }
}

export class GameFinished {
    readonly winner: string;

    constructor(winner: string) {
        this.winner = winner;
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

export class GameModel {
    private sign_manager: SignManager;

    game_phase: ValueNotifier<GameStage | null> =
        new ValueNotifier<GameStage | null>(null);

    private constructor(sign_manager: SignManager) {
        this.sign_manager = sign_manager;
    }

    static async create() {
        const sign_manager = await SignManager.init();
        return new GameModel(sign_manager);
    }

    join_session(player_name: string, session_id: string) {
        const on_game_start = (result: ConnectionResult) => {
            const running = new GameRunning(
                result,
                this.sign_manager,
                player_name,
                (winner) => {
                    this.game_phase.value = new GameFinished(winner);
                },
            );
            this.game_phase.value = running;
            running.run();
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
