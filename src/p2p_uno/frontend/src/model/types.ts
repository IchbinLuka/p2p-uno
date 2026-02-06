export interface Player {
    name: string;
    public_key: Uint8Array;
}

export interface PlayerGame extends Player {
    cards: { [key: string]: UnknownCard };
}

function get_all_cards() {
    const cards: CardType[] = [];

    for (let num = 1; num <= 9; num++) {
        cards.push({ color: Color.RED, number: num });
        cards.push({ color: Color.GREEN, number: num });
        cards.push({ color: Color.BLUE, number: num });
        cards.push({ color: Color.YELLOW, number: num });
    }
    return cards;
}

export const ALL_CARDS = get_all_cards();

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

export interface KnownCard extends UnknownCard {
    card_type: CardType; // Only owner should know card until it is played
}
