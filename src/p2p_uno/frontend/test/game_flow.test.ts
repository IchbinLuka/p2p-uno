import { describe, it, expect } from "vitest";
import { GameRunning, type UICard } from "../src/model/model";
import type {
    ConnectionResult,
    PlayerConnection,
} from "../src/model/ice_messaging";
import {
    type PlayerGame,
    type KnownCard,
    type Card,
    type CardType,
    Color,
} from "../src/model/types";
import type { Message, PlayerMessage } from "../src/model/connection";
import type { SignManager } from "../src/model/signing";

/**
 * Simplified mock SignManager used for testing the game flow without relying on SubtleCrypto.
 */
class MockSignManager implements SignManager {
    public publicKeyExported: Uint8Array;
    private static keyCounter = 0;
    private id: string;

    private constructor(id: string) {
        this.id = id;
        this.publicKeyExported = new TextEncoder().encode(`mockkey-${id}`);
    }

    static init(): Promise<MockSignManager> {
        const id = `${MockSignManager.keyCounter++}`;
        return Promise.resolve(new MockSignManager(id));
    }

    sampleCard(): Card {
        const nonce = new Uint8Array(32);
        for (let i = 0; i < 32; i++) nonce[i] = i & 0xff;
        return {
            initial_nonce: nonce,
            signatures: [],
            uuid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        };
    }

    private makeSignature(payload: Uint8Array, author: string): Uint8Array {
        const authorBytes = new TextEncoder().encode(`@${author}`);
        const out = new Uint8Array(payload.length + authorBytes.length);
        out.set(payload, 0);
        out.set(authorBytes, payload.length);
        return out;
    }

    signCard(card: Card, own_name: string): Promise<Card> {
        const payloadToSign =
            card.signatures.length > 0
                ? card.signatures[card.signatures.length - 1].signature
                : card.initial_nonce;
        const signature = this.makeSignature(payloadToSign, own_name);
        return Promise.resolve({
            ...card,
            signatures: [
                ...card.signatures,
                {
                    signature,
                    author: own_name,
                },
            ],
        });
    }

    finalizeCard(card: Card, own_name: string): Promise<KnownCard> {
        if (card.signatures.length === 0) {
            return Promise.reject(
                new Error("Cannot finalize card with no signatures"),
            );
        }
        const last = card.signatures[card.signatures.length - 1];
        if (last.author !== own_name) {
            return Promise.reject(
                new Error(
                    "Can only finalize a card last signed by the player.",
                ),
            );
        }
        const hash = last.signature;
        const sum = Array.from(last.signature).reduce((a, b) => a + b, 0);
        const colorIdx = sum % 4;
        const number = (sum % 9) + 1;
        const color = [Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW][
            colorIdx
        ];
        return Promise.resolve({
            ...card,
            hash,
            card_type: { color, number } as CardType,
        });
    }

    signMessage(message: Message, own_name: string): Promise<PlayerMessage> {
        const payloadBytes = new TextEncoder().encode(JSON.stringify(message));
        const signature = this.makeSignature(payloadBytes, own_name);
        return Promise.resolve({
            player: own_name,
            signature,
            payload: message,
        });
    }

    signPayload(payload: Uint8Array): Promise<Uint8Array> {
        return Promise.resolve(this.makeSignature(payload, this.id));
    }

    verifyMessage(
        message: PlayerMessage,
        _players: Partial<Record<string, PlayerGame>>,
    ): Promise<boolean> {
        const authorSuffix = new TextEncoder().encode(`@${message.player}`);
        const sig = message.signature;
        if (!sig || sig.length < authorSuffix.length)
            return Promise.resolve(false);
        for (let i = 0; i < authorSuffix.length; i++) {
            if (sig[sig.length - authorSuffix.length + i] !== authorSuffix[i])
                return Promise.resolve(false);
        }
        return Promise.resolve(true);
    }

    verifyCard(
        card: Card,
        _players: Partial<Record<string, PlayerGame>>,
    ): Promise<boolean> {
        let currentPayload = card.initial_nonce;
        for (let i = 0; i < card.signatures.length; i++) {
            const sig = card.signatures[i].signature;
            const author = card.signatures[i].author;
            const expected = this.makeSignature(currentPayload, author);
            if (sig.length !== expected.length) return Promise.resolve(false);
            for (let j = 0; j < sig.length; j++) {
                if (sig[j] !== expected[j]) return Promise.resolve(false);
            }
            currentPayload = sig;
        }
        return Promise.resolve(true);
    }

    async verifyKnownCard(
        card: KnownCard,
        expectedHash: Uint8Array,
        _players: Partial<Record<string, PlayerGame>>,
    ): Promise<boolean> {
        const ok = await this.verifyCard(card, {});
        if (!ok) return false;
        if (!expectedHash || expectedHash.length !== card.hash.length)
            return false;
        for (let i = 0; i < card.hash.length; i++) {
            if (card.hash[i] !== expectedHash[i]) return false;
        }
        return true;
    }
}

function buildConnectionResult(
    playerNames: string[],
    top_card: CardType,
): ConnectionResult {
    const players: PlayerConnection[] = playerNames.map((name) => {
        return {
            name,
            data_channel: undefined,
            connection: undefined,
            public_key: new TextEncoder().encode(`pub-${name}`),
            sent_offer: false,
        };
    });
    return {
        players,
        top_card,
    };
}

describe("Game flow", () => {
    it("runs prepare -> draw -> waiting and allows playing a card", async () => {
        const manager = await MockSignManager.init();

        const playerName = "alice";
        const connectionResult = buildConnectionResult([playerName], {
            color: "red",
            number: 1,
        } as CardType);

        // pass mock as any to satisfy constructor typing
        const game = new GameRunning(
            connectionResult,
            manager,
            playerName,
            (_winner: string, _aborted: boolean) => {
                // do nothing
            },
        );

        game.run();

        // give the game loop a short moment to progress through preparing/drawing
        await new Promise((r) => setTimeout(r, 50));

        const ownCards = Object.values(game.own_cards);
        expect(Array.isArray(ownCards)).toBe(true);
        expect(ownCards.length).toBeGreaterThanOrEqual(1);

        const uiCard: UICard = {
            uuid: ownCards[0].uuid,
            card_type: ownCards[0].card_type,
        };

        // Wait until the notifier updates out of preparing (or short-circuit)
        let attempts = 0;
        while (game.state.value === "preparing" && attempts < 50) {
            await new Promise((r) => setTimeout(r, 20));
            attempts++;
        }

        await game.play_card(uiCard);

        // small delay to allow state mutation
        await new Promise((r) => setTimeout(r, 20));

        expect(game.own_cards[uiCard.uuid]).toBeUndefined();
    }, 10_000);
});
