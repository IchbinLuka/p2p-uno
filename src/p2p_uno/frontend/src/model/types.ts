export interface Player {
    name: string;
    // The key should be derived from the initial nonce of the card
    cards: { [key: string]: UnknownCard };
    public_key: Uint8Array;
}

export enum Color {
    RED = "red",
    GREEN = "green",
    BLUE = "blue",
    YELLOW = "yellow",
}

export interface CardType {
    color: Color;
    number: number;
}

export interface Signature {
    author: string;
    signature: Uint8Array;
}

export interface Card {
    uuid: string;
    initial_nonce: Uint8Array;
    signatures: Signature[];
}

export interface UnknownCard extends Card {
    hash: Uint8Array;
}

export interface KnownCard extends Card {
    card_type: CardType; // Only owner should know card until it is played
}
