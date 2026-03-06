import { describe, it, expect } from "vitest";
import { SignManagerImpl } from "../src/model/signing";
import type { PlayerGame } from "../src/model/types";
import { MessageType, type KickVote } from "../src/model/connection";

describe("signing & verifying card", () => {
    it("", async () => {
        const manager1 = await SignManagerImpl.init();
        const manager2 = await SignManagerImpl.init();

        const players: { [key: string]: PlayerGame } = {
            bob: {
                name: "bob",
                public_key: manager1.publicKeyExported,
                cards: {},
                kick_votes: {},
                kicked: false,
            },
            alice: {
                name: "alice",
                public_key: manager2.publicKeyExported,
                cards: {},
                kick_votes: {},
                kicked: false,
            },
        };
        const message = {
            type: MessageType.KICK_VOTE,
            player: "alice",
            reason: "testing",
        } satisfies KickVote;
        const signed = await manager1.signMessage(message, "bob");
        expect.assert(await manager2.verifyMessage(signed, players));
    });
});
