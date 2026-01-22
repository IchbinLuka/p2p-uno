import type { PlayerError } from "./game";
import type { Card, KnownCard, Player } from "./types";

export type Message =
    | SignCardMessage
    | DrawCardRequest
    | FinalizeCardDraw
    | PlayCard;

export enum MessageType {
    SIGN_CARD = "sign_card",
    DRAW_CARD_REQUEST = "draw_card_request",
    FINALIZE_CARD_DRAW = "finalize_card_draw",
    PLAY_CARD = "play_card",
}

export interface SignCardMessage {
    card_nonce: Uint8Array;
    signature: Uint8Array;
}

export interface DrawCardRequest {
    initial_card: Card;
}

export interface FinalizeCardDraw {
    card_hash: Uint8Array;
}

export interface PlayCard {
    card_hash: Uint8Array;
    card: KnownCard;
}

export interface MessageData {
    type: MessageType;
    message: Message;
}

export interface ConnectionManager {
    await_message(player: Player, types: MessageType[]): Promise<MessageData>;
    add_kick_vote_listener(listener: (violation: PlayerError) => void): void;
}
