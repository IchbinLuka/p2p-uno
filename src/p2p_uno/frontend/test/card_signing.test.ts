import { describe, it, expect } from "vitest";
import { SignManager } from "../src/model/signing";
import type { PlayerGame } from "../src/model/types";

describe("signing & verifying card", () => {
    it("", async () => {
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

        const card = manager1.sampleCard();
        const signed = await manager2.signCard(card, "bob");
        expect.assert(manager1.verifyCard(signed, players));
        // const revealed = await manager2.
        // manager1.verifyKnownCard()
    });
});
