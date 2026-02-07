/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
    deserialize_message,
    serialize_message,
} from "../src/model/serialization";
import { SignManager } from "../src/model/signing";
import type { PlayerGame } from "../src/model/types";
import {
    MessageType,
    type DrawCard,
    type PlayerMessage,
} from "../src/model/connection";

describe("Test serialization + deserialization of messages", () => {
    it("serialization & deserialization", () => {
        const message = {
            a: new Uint8Array([1, 2, 3]),
            b: "foo",
        };
        const serialized = serialize_message(message);
        const deserialized: any = deserialize_message(serialized);
        expect(message.a).toEqual(deserialized.a);
        expect(message.b).toEqual(deserialized.b);
    });

    it("serialization with signing", async () => {
        const manager1 = await SignManager.init();
        const manager2 = await SignManager.init();

        const players: { [key: string]: PlayerGame } = {
            bob: {
                name: "bob",
                public_key: manager1.publicKeyExported,
                cards: {},
            },
            alice: {
                name: "alice",
                public_key: manager2.publicKeyExported,
                cards: {},
            },
        };

        const message: DrawCard = {
            type: MessageType.DRAW_CARD_REQUEST,
            initial_card: manager1.sampleCard(),
        };

        const signed = await manager1.signMessage(message, "bob");
        const serialized = serialize_message(signed);
        const deserialized = deserialize_message(serialized) as PlayerMessage;
        expect.assert(await manager2.verifyMessage(deserialized, players));
    });
});
