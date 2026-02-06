import {
    MessageType,
    type ConnectionManager,
    type DrawCardRequest,
    type FinalizeCardDraw,
    type PlayCard,
    type SignCardMessage,
} from "./connection";
import { InvalidAction, InvalidSignature, PlayerError } from "./errors";
import type { SignManager } from "./signing";
import type {
    Card,
    CardType,
    KnownCard,
    PlayerGame,
    UnknownCard,
} from "./types";

const INITIAL_CARD_COUNT = 7;

export class DrawingCard {
    current_card: Card;
    next_player: string;

    constructor(current_card: Card, next_player: string) {
        this.current_card = current_card;
        this.next_player = next_player;
    }
}
export class WaitingPhase {
    current_player_idx: number;
    player_card_counts: Record<string, number>;
    top_card: CardType;

    constructor(
        current_player: number,
        player_card_counts: Record<string, number>,
        top_card: CardType,
    ) {
        this.current_player_idx = current_player;
        this.player_card_counts = player_card_counts;
        this.top_card = top_card;
    }
}

class Finished {
    winner: string;

    constructor(winner: string) {
        this.winner = winner;
    }
}

class Preparing {
    current_player: string;
    current_card: Card | null;

    constructor(current_player: string, current_card: Card | null) {
        this.current_player = current_player;
        this.current_card = current_card;
    }
}

type GamePhase = DrawingCard | WaitingPhase | Finished | Preparing;

interface GameResult {
    winner?: string;
    aborted: boolean;
}

/**
 * Class which manages the game flow. This class essentially acts a bit like a server
 * and does not differentiate between the own player and other players.
 */
export class GameManager {
    private sign_manager: SignManager;
    private current_phase: GamePhase;
    private players: Record<string, PlayerGame>;
    private player_order: string[];
    private connection_manager: ConnectionManager;
    private top_card: CardType | null;
    private on_violation: (violation: PlayerError) => void;
    private readonly phase_listeners: Set<(state: GamePhase) => void> =
        new Set();

    constructor(
        sign_manager: SignManager,
        player_order: string[],
        connection_manager: ConnectionManager,
        on_violation: (violation: PlayerError) => void,
        players: Record<string, PlayerGame>,
    ) {
        this.sign_manager = sign_manager;
        this.players = players;
        this.current_phase = new Preparing(player_order[0], null);
        this.player_order = player_order;
        this.connection_manager = connection_manager;
        this.top_card = null;
        this.on_violation = on_violation;
    }

    add_phase_listener(listener: (state: GamePhase) => void) {
        this.phase_listeners.add(listener);
    }

    remove_phase_listener(listener: (state: GamePhase) => void) {
        this.phase_listeners.delete(listener);
    }

    private update_phase(new_phase: GamePhase) {
        this.current_phase = new_phase;
        this.phase_listeners.forEach((listener) => listener(new_phase));
    }

    get_state() {
        return {
            phase: this.current_phase,
            top_card: this.top_card,
        };
    }

    private async prepare_game() {
        for (let p = 0; p < this.player_order.length; p++) {
            const player = this.player_order[p];
            // The first player needs to draw one more card as in the first round
            // there is no top card yet
            const card_count =
                p == 0 ? INITIAL_CARD_COUNT + 1 : INITIAL_CARD_COUNT;
            for (let i = 0; i < card_count; i++) {
                const request = await this.connection_manager.await_message(
                    this.players[player].name,
                    [MessageType.DRAW_CARD_REQUEST],
                );
                const initial = (request as DrawCardRequest).initial_card;
                await this.handle_draw_card(p, initial);
            }
        }
        // Expect the first player to play a card
        const first_player = this.player_order[0];
        const top_card_play = (await this.connection_manager.await_message(
            first_player,
            [MessageType.PLAY_CARD],
        )) as PlayCard;
        await this.handle_play_card(
            this.players[first_player],
            top_card_play.card,
        );
    }

    private async handle_play_card(player: PlayerGame, card: KnownCard) {
        if (
            this.top_card != null &&
            card.card_type.number !== this.top_card.number &&
            card.card_type.color !== this.top_card.color
        ) {
            throw new InvalidAction(
                "It is not allowed to play this card.",
                player.name,
            );
        }
        const valid = await this.sign_manager.verifyKnownCard(
            card,
            player.cards[card.uuid].hash,
            this.players,
        );
        if (!valid) {
            throw new InvalidSignature(player.name);
        }
        this.top_card = card.card_type;
        delete player.cards[card.uuid];
        if (Object.keys(player.cards).length == 0) {
            this.current_phase = new Finished(player.name);
        }
    }

    private async handle_draw_card(player_idx: number, initial_card: Card) {
        const player = this.players[this.player_order[player_idx]];
        if (initial_card.signatures.length != 0) {
            throw new InvalidAction("signatures must be empty", player.name);
        }
        if (initial_card.uuid in player.cards) {
            throw new InvalidAction(
                "Cannot have two cards with the same UUID",
                player.name,
            );
        }
        this.update_phase(
            new DrawingCard(
                initial_card,
                this.player_order[(player_idx + 1) % this.player_order.length],
            ),
        );
        const card: Card = initial_card;
        // Signatures from peers
        for (
            let i = player_idx + 1;
            i < player_idx + Object.keys(this.players).length;
            i++
        ) {
            const current_player =
                this.players[this.player_order[i % this.player_order.length]];
            const message = await this.connection_manager.await_message(
                current_player.name,
                [MessageType.SIGN_CARD],
            );
            console.debug(
                `GameManager: Received signature from ${current_player.name}`,
            );
            const signature = (message as SignCardMessage).signature;
            card.signatures.push({
                signature,
                author: current_player.name,
            });
            if (!(await this.sign_manager.verifyCard(card, this.players))) {
                throw new InvalidSignature(current_player.name);
            }
        }

        // Signature from initiator
        const finalization = await this.connection_manager.await_message(
            player.name,
            [MessageType.FINALIZE_CARD_DRAW],
        );
        const hash = (finalization as FinalizeCardDraw).card_hash;
        const final_card: UnknownCard = {
            hash,
            ...card,
        };
        player.cards[final_card.uuid] = final_card;
        console.debug(`Finalized ${final_card.uuid} for ${player.name}`);
    }

    get_player_card_counts(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const player of Object.values(this.players)) {
            counts[player.name] = Object.keys(player.cards).length;
        }
        return counts;
    }

    get_top_card(): CardType {
        return this.top_card!;
    }

    async game_flow(): Promise<GameResult> {
        try {
            await this.prepare_game();
        } catch (e) {
            if (e instanceof PlayerError) {
                return { aborted: true };
            }
            // If unexpected error, propagate up
            throw e;
        }
        this.update_phase(
            new WaitingPhase(0, this.get_player_card_counts(), this.top_card!),
        );
        let current_player_idx = 0;
        while (true) {
            const current_player =
                this.players[this.player_order[current_player_idx]];
            const message = await this.connection_manager.await_message(
                current_player.name,
                [
                    MessageType.DRAW_CARD_REQUEST,
                    MessageType.PLAY_CARD,
                    MessageType.SKIP_TURN,
                ],
            );
            try {
                if (message.type == MessageType.PLAY_CARD) {
                    await this.handle_play_card(current_player, message.card);
                } else if (message.type == MessageType.DRAW_CARD_REQUEST) {
                    await this.handle_draw_card(
                        current_player_idx,
                        message.initial_card,
                    );
                    const message2 =
                        await this.connection_manager.await_message(
                            current_player.name,
                            [MessageType.PLAY_CARD, MessageType.SKIP_TURN],
                        );
                    if (message2.type == MessageType.PLAY_CARD) {
                        await this.handle_play_card(
                            current_player,
                            message2.card,
                        );
                    } else if (message2.type == MessageType.SKIP_TURN) {
                        // Do nothing
                    }
                } else if (message.type == MessageType.SKIP_TURN) {
                    // Do nothing
                }
            } catch (e) {
                if (e instanceof PlayerError) {
                    console.info(`Encountered game rule violation: ${e}`);
                    this.on_violation(e);
                }
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                console.error(`Encountered Error: ${e}.`);
            }
            if (this.current_phase instanceof Finished) {
                return {
                    winner: current_player.name,
                    aborted: false,
                };
            }
            current_player_idx =
                (current_player_idx + 1) % this.player_order.length;
            this.update_phase(
                new WaitingPhase(
                    current_player_idx,
                    this.get_player_card_counts(),
                    this.top_card!,
                ),
            );
        }
    }
}
