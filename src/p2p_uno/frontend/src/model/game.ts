import { AsyncQueue } from "./async_queue";
import { MessageType, type PlayerMessage } from "./connection";
import { InvalidAction, InvalidSignature, PlayerError } from "./errors";
import { Semaphore } from "./semaphore";
import type { SignManager } from "./signing";
import type { Card, CardType, PlayerGame, UnknownCard } from "./types";

const INITIAL_CARD_COUNT = 7;

export type GamePhase = DrawingCard | WaitingPhase | Finished | Preparing;

export interface GameResult {
    winner?: string;
    aborted: boolean;
}

export abstract class TimeoutPhase {
    abstract timeout: number;
    abstract timeout_player: number;
}

export class DrawingCard extends TimeoutPhase {
    // 10 second timeout
    timeout: number = 10_000;

    get timeout_player(): number {
        return this.next_player_idx;
    }

    current_card: Card;
    initiator: string;
    next_player: string;
    next_player_idx: number;
    preparing: boolean;

    constructor(
        current_card: Card,
        initiator: string,
        next_player: string,
        next_player_idx: number,
        preparing: boolean,
    ) {
        super();
        this.initiator = initiator;
        this.current_card = current_card;
        this.next_player = next_player;
        this.next_player_idx = next_player_idx;
        this.preparing = preparing;
    }
}
export class WaitingPhase extends TimeoutPhase {
    current_player_idx: number;
    player_card_counts: Record<string, number>;
    top_card: CardType;

    constructor(
        current_player: number,
        player_card_counts: Record<string, number>,
        top_card: CardType,
    ) {
        super();
        this.current_player_idx = current_player;
        this.player_card_counts = player_card_counts;
        this.top_card = top_card;
    }

    get timeout(): number {
        // If top_card is null -> we are still preparing, all messages are sent automatically
        // -> Use smaller timeout
        return this.top_card == null ? 10_000 : 95_000;
    }

    get timeout_player(): number {
        return this.current_player_idx;
    }
}

class Finished {
    winner: string;
    aborted: boolean;

    constructor(winner: string, aborted: boolean) {
        this.winner = winner;
        this.aborted = aborted;
    }
}

export class Preparing extends TimeoutPhase {
    timeout: number = 10_000;
    current_player_idx: number;

    constructor(current_player_idx: number) {
        super();
        this.current_player_idx = current_player_idx;
    }

    get timeout_player(): number {
        return this.current_player_idx;
    }
}

export enum RequestType {
    DRAW_CARD = "draw_card",
    SIGN_CARD = "sign_card",
    PLAY = "play",
    FINALIZE_DRAW = "finalize_draw",
}

export interface DrawCardRequest {
    type: RequestType.DRAW_CARD;
}

export interface SignCardRequest {
    type: RequestType.SIGN_CARD;
    current_card: Card;
}

export interface FinalizeDrawRequest {
    type: RequestType.FINALIZE_DRAW;
    current_card: Card;
}

export interface PlayRequest {
    type: RequestType.PLAY;
}

export type MessageRequest =
    | DrawCardRequest
    | SignCardRequest
    | PlayRequest
    | FinalizeDrawRequest;

export type RequestListener = (request: MessageRequest) => void;

export class PlayerTimeout {
    readonly player_idx: number;
    readonly start_time: number;
    readonly duration: number;

    private timer_id: number;

    constructor(player_idx: number, duration: number, on_timeout: () => void) {
        this.player_idx = player_idx;
        this.duration = duration;
        this.start_time = Date.now();
        this.timer_id = setTimeout(on_timeout, duration);
    }

    remaining_time(): number {
        return Math.max(0, this.duration - (Date.now() - this.start_time));
    }

    abort(): void {
        clearTimeout(this.timer_id);
    }
}

/**
 * Class which manages the game flow. This class essentially acts a bit like a server
 * and does not differentiate between the own player and other players.
 */
export class GameManager {
    private phase: GamePhase;
    private readonly sign_manager: SignManager;
    private readonly players: Record<string, PlayerGame>;
    private readonly player_order: string[];
    private top_card: CardType;
    private phase_listeners: Set<(phase: GamePhase) => void> = new Set();
    readonly phase_queue: AsyncQueue<GamePhase> = new AsyncQueue();
    private readonly message_mutex: Semaphore = new Semaphore(1);

    constructor(
        sign_manager: SignManager,
        player_order: string[],
        on_violation: (violation: PlayerError) => void,
        players: Record<string, PlayerGame>,
        top_card: CardType,
    ) {
        this.sign_manager = sign_manager;
        this.players = players;
        this.phase = new Preparing(0);
        this.player_order = player_order;
        this.top_card = top_card;
        this.on_violation = on_violation;
    }

    add_phase_listener(listener: (phase: GamePhase) => void) {
        this.phase_listeners.add(listener);
        listener(this.phase);
    }

    remove_phase_listener(listener: (phase: GamePhase) => void) {
        this.phase_listeners.delete(listener);
    }

    on_violation(_violation: PlayerError) {}

    update_phase(new_phase: GamePhase) {
        this.phase = new_phase;
        for (const listener of this.phase_listeners) {
            listener(new_phase);
        }
    }

    get_player_card_counts(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const player of Object.values(this.players)) {
            if (player.kicked) continue;
            counts[player.name] = Object.keys(player.cards).length;
        }
        return counts;
    }

    private get_next_player(current: number): number {
        for (let i = 0; i < this.player_order.length; i++) {
            const next = (current + i + 1) % this.player_order.length;
            if (!(this.player_order[next] in this.players)) {
                // Player has been removed
                continue;
            }
            if (!this.players[this.player_order[next]].kicked) {
                return next;
            }
        }
        return current;
    }

    private async handle_draw_phase(
        message: PlayerMessage,
        phase: DrawingCard,
    ): Promise<GamePhase> {
        if (message.player !== phase.next_player) {
            throw new InvalidAction(
                `Got a message from an unexpected player`,
                message.player,
            );
        }
        const payload = message.payload;

        if (payload.type === MessageType.FINALIZE_CARD_DRAW) {
            const hash = payload.card_hash;
            const final_card: UnknownCard = {
                hash,
                ...phase.current_card,
            };
            this.players[message.player].cards[final_card.uuid] = final_card;
            console.debug(`Finalized ${final_card.uuid} for ${message.player}`);
            if (phase.preparing) {
                const player_idx = this.player_order.indexOf(message.player);
                const card_count = INITIAL_CARD_COUNT;
                if (
                    Object.keys(this.players[message.player].cards).length <
                    card_count
                ) {
                    // Player has not drawn enough cards
                    return new Preparing(player_idx);
                } else if (player_idx !== this.player_order.length - 1) {
                    // Switch to next player
                    return new Preparing(this.get_next_player(player_idx));
                } else {
                    // All players have drawn all cards
                    return new WaitingPhase(
                        0,
                        this.get_player_card_counts(),
                        this.top_card,
                    );
                }
            } else {
                return new WaitingPhase(
                    this.player_order.indexOf(phase.initiator),
                    this.get_player_card_counts(),
                    this.top_card,
                );
            }
        } else if (payload.type === MessageType.SIGN_CARD) {
            phase.current_card.signatures.push({
                signature: payload.signature,
                author: message.player,
            });
            if (
                !(await this.sign_manager.verifyCard(
                    phase.current_card,
                    this.players,
                ))
            ) {
                this.on_violation(new InvalidSignature(message.player));
                throw new InvalidAction(
                    `Card signature verification failed`,
                    message.player,
                );
            }
            const next_player_idx = this.get_next_player(phase.next_player_idx);
            const next_player = this.player_order[next_player_idx];
            return new DrawingCard(
                phase.current_card,
                phase.initiator,
                next_player,
                next_player_idx,
                phase.preparing,
            );
        } else {
            throw new InvalidAction(
                `Got an unexpected message type ${message.payload.type}`,
                message.player,
            );
        }
    }

    private async handle_waiting_phase(
        message: PlayerMessage,
        phase: WaitingPhase,
    ): Promise<GamePhase> {
        if (message.player !== this.player_order[phase.current_player_idx]) {
            console.error(`Got an unexpected message from ${message.player}`);
            throw new InvalidAction(
                `Got an unexpected message from ${message.player}`,
                message.player,
            );
        }
        const payload = message.payload;
        // SKIP_TURN and DRAW_CARD are only allowed if there already is a top card
        if (payload.type == MessageType.SKIP_TURN && phase.top_card != null) {
            const new_player_idx = this.get_next_player(
                phase.current_player_idx,
            );
            return new WaitingPhase(
                new_player_idx,
                this.get_player_card_counts(),
                this.top_card,
            );
        } else if (
            payload.type === MessageType.DRAW_CARD_REQUEST &&
            phase.top_card != null
        ) {
            const next_player_idx = this.get_next_player(
                phase.current_player_idx,
            );
            const next_player = this.player_order[next_player_idx];
            return new DrawingCard(
                payload.initial_card,
                message.player,
                next_player,
                next_player_idx,
                false,
            );
        } else if (payload.type === MessageType.PLAY_CARD) {
            const card = payload.card;
            if (
                this.top_card != null &&
                card.card_type.number !== this.top_card.number &&
                card.card_type.color !== this.top_card.color
            ) {
                throw new InvalidAction(
                    "It is not allowed to play this card.",
                    message.player,
                );
            }
            const valid = await this.sign_manager.verifyKnownCard(
                card,
                this.players[message.player].cards[card.uuid].hash,
                this.players,
            );
            if (!valid) {
                throw new InvalidSignature(message.player);
            }
            this.top_card = card.card_type;
            delete this.players[message.player].cards[card.uuid];
            if (Object.keys(this.players[message.player].cards).length == 0) {
                return new Finished(message.player, false);
            } else {
                const next_player_idx = this.get_next_player(
                    phase.current_player_idx,
                );
                return new WaitingPhase(
                    next_player_idx,
                    this.get_player_card_counts(),
                    this.top_card,
                );
            }
        } else {
            throw new InvalidAction(
                `${payload.type} is not allowed in this context`,
                message.player,
            );
        }
    }

    private handle_preparing(
        message: PlayerMessage,
        phase: Preparing,
    ): GamePhase {
        const current_player = this.player_order[phase.current_player_idx];
        if (message.player !== current_player) {
            throw new InvalidAction(
                `Got a message from ${message.player} but expected ${current_player}`,
                message.player,
            );
        }
        const payload = message.payload;
        if (payload.type === MessageType.DRAW_CARD_REQUEST) {
            const next_player_idx = this.get_next_player(
                phase.current_player_idx,
            );
            const next_player = this.player_order[next_player_idx];
            return new DrawingCard(
                payload.initial_card,
                message.player,
                next_player,
                next_player_idx,
                true,
            );
        } else {
            throw new InvalidAction(
                `Preparing phase only allows for draw card requests, got ${payload.type} instead`,
                message.player,
            );
        }
    }

    private handle_kicked(player: string) {
        const remaining_players = this.player_order.filter(
            (p) => !this.players[p].kicked,
        ).length;
        if (
            remaining_players < this.player_order.length / 2 ||
            remaining_players == 1
        ) {
            console.debug(`Game finished due to insufficient players`);
            this.update_phase(new Finished("", true));
            return;
        }
        if (this.phase instanceof Preparing) {
            this.update_phase(
                new Preparing(
                    this.get_next_player(this.player_order.indexOf(player)),
                ),
            );
        } else if (this.phase instanceof DrawingCard) {
            const next_player_id = this.get_next_player(
                this.player_order.indexOf(player),
            );
            const next_player = this.player_order[next_player_id];
            this.update_phase(
                new DrawingCard(
                    this.phase.current_card,
                    this.phase.initiator,
                    next_player,
                    next_player_id,
                    this.phase.preparing,
                ),
            );
        } else if (this.phase instanceof WaitingPhase) {
            this.update_phase(
                new WaitingPhase(
                    this.get_next_player(this.player_order.indexOf(player)),
                    // The player card counts have changed as one player has been removed
                    this.get_player_card_counts(),
                    this.phase.top_card,
                ),
            );
        } else if (this.phase instanceof Finished) {
            // No nothing
        } else {
            this.phase satisfies never;
        }
    }

    async on_message(message: PlayerMessage) {
        return await this.message_mutex.with(async () => {
            if (this.players[message.player].kicked) {
                console.log(
                    `Player ${message.player} is kicked, ignoring message...`,
                );
                return;
            }
            if (message.payload.type === MessageType.KICK_VOTE) {
                const player = this.players[message.payload.player];
                if (message.player in player.kick_votes) {
                    // Player has already voted
                    return;
                }
                player.kick_votes[message.player] = message.payload;
                console.debug(
                    `Player ${message.player} voted to kick ${message.payload.player}. Total votes: ${Object.keys(player.kick_votes).length}`,
                );
                console.debug(
                    `Kick votes: ${JSON.stringify(player.kick_votes)}`,
                );
                // Set player to kicked on majority vote
                if (
                    Object.keys(player.kick_votes).length >=
                    this.player_order.length / 2
                ) {
                    console.log(`Player ${message.player} has been kicked`);
                    player.kicked = true;
                    this.handle_kicked(message.player);
                }
                return;
            }
            try {
                let new_phase: GamePhase;
                if (this.phase instanceof Preparing) {
                    new_phase = this.handle_preparing(message, this.phase);
                } else if (this.phase instanceof DrawingCard) {
                    new_phase = await this.handle_draw_phase(
                        message,
                        this.phase,
                    );
                } else if (this.phase instanceof WaitingPhase) {
                    new_phase = await this.handle_waiting_phase(
                        message,
                        this.phase,
                    );
                } else if (this.phase instanceof Finished) {
                    console.warn("Did not expect a message in finished stage");
                    new_phase = this.phase;
                } else {
                    this.phase satisfies never;
                    throw new Error("Invalid game phase");
                }
                this.update_phase(new_phase);
            } catch (error) {
                if (error instanceof PlayerError) {
                    // Just ignore the message as this might not be enough evidence to
                    // conclude that the sender is using a manipulated client.
                    // Since the P2P network may not be fully connected, a different peer could
                    // impersonate the author of the original message by e.g. repeating messages from
                    // the past.
                    // For example, one peer could distribute a DRAW_CARD message for a card that
                    // has already been drawn
                    console.error(`Ignoring Player error: ${error.message}`);
                } else {
                    throw error;
                }
            }
        });
    }
}
