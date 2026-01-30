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
import type { Card, CardType, KnownCard, Player, UnknownCard } from "./types";

const INITIAL_CARD_COUNT = 7;

class DrawingCard {
    current_card: Card;
    next_player: string;

    constructor(current_card: Card, next_player: string) {
        this.current_card = current_card;
        this.next_player = next_player;
    }
}
class WaitingPlay {
    current_player_idx: number;

    constructor(current_player: number) {
        this.current_player_idx = current_player;
    }
}

class Finished {
    winner: string;

    constructor(winner: string) {
        this.winner = winner;
    }
}

type GamePhase = DrawingCard | WaitingPlay | Finished;

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
    private players: { [key: string]: Player };
    private player_order: string[];
    private connection_manager: ConnectionManager;
    private top_card: CardType | null;
    private on_violation: (violation: PlayerError) => void;

    constructor(
        sign_manager: SignManager,
        player_order: string[],
        connection_manager: ConnectionManager,
        on_violation: (violation: PlayerError) => void,
        players: { [key: string]: Player },
    ) {
        this.sign_manager = sign_manager;
        this.players = players;
        this.current_phase = new WaitingPlay(0);
        this.player_order = player_order;
        this.connection_manager = connection_manager;
        this.top_card = null;
        this.on_violation = on_violation;
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
            for (let i = 0; i < INITIAL_CARD_COUNT; i++) {
                const request = await this.connection_manager.await_message(
                    this.players[player],
                    [MessageType.DRAW_CARD_REQUEST],
                );
                const initial = (request as DrawCardRequest).initial_card;
                await this.handle_draw_card(p, initial);
            }
        }
    }

    private async handle_play_card(player: Player, card: KnownCard) {
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
        const card: Card = initial_card;
        // Signatures from peers
        for (
            let i = player_idx;
            i < player_idx + Object.keys(this.players).length - 1;
            i++
        ) {
            const current_player =
                this.players[this.player_order[i % this.player_order.length]];
            const message = await this.connection_manager.await_message(
                current_player,
                [MessageType.SIGN_CARD],
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
            player,
            [MessageType.FINALIZE_CARD_DRAW],
        );
        const hash = (finalization as FinalizeCardDraw).card_hash;
        const final_card: UnknownCard = {
            hash,
            ...card,
        };
        player.cards[final_card.uuid] = final_card;
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
        this.current_phase = new WaitingPlay(0);
        let current_player_idx = 0;
        while (true) {
            const current_player =
                this.players[this.player_order[current_player_idx]];
            const message = await this.connection_manager.await_message(
                current_player,
                [MessageType.DRAW_CARD_REQUEST, MessageType.PLAY_CARD],
            );
            try {
                if (message.type == MessageType.PLAY_CARD) {
                    this.handle_play_card(
                        current_player,
                        (message as PlayCard).card,
                    );
                } else if (message.type == MessageType.DRAW_CARD_REQUEST) {
                    this.handle_draw_card(
                        current_player_idx,
                        (message as DrawCardRequest).initial_card,
                    );
                }
            } catch (e) {
                if (e instanceof PlayerError) {
                    console.info(`Encountered game rule violation: ${e}`);
                    this.on_violation(e);
                }
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
        }
    }
}
