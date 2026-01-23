/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
    deserialize_message,
    serialize_message,
} from "../model.ts/serialization";
import { SignManager } from "../model.ts/signing";
import type { Player } from "../model.ts/types";
import {
    MessageType,
    type DrawCardRequest,
    type MessageData,
} from "../model.ts/connection";

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

        const players: { [key: string]: Player } = {
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

        const message: DrawCardRequest = {
            initial_card: manager1.sampleCard(),
        };

        const message_data: MessageData = {
            type: MessageType.DRAW_CARD_REQUEST,
            message,
        };

        const signed = await manager1.signMessage(message_data, "bob");
        expect.assert(manager2.verifyMessage(signed, players));
    });
});
