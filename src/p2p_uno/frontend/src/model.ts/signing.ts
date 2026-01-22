import type { Card, KnownCard, Player } from "./types";

export class SignManager {
    private keyPair!: CryptoKeyPair;
    public publicKeyExported!: Uint8Array;

    private constructor() {}

    /**
     * Initializes the SignManager by generating a permanent ECDSA key pair[cite: 10].
     */
    static async init(): Promise<SignManager> {
        const manager = new SignManager();
        manager.keyPair = await window.crypto.subtle.generateKey(
            {
                name: "ECDSA",
                namedCurve: "P-256",
            },
            true, // extractable
            ["sign", "verify"],
        );

        const exported = await window.crypto.subtle.exportKey(
            "raw",
            manager.keyPair.publicKey,
        );
        manager.publicKeyExported = new Uint8Array(exported);

        return manager;
    }

    sampleCard(): Card {
        const nonce = new Uint8Array(32);
        window.crypto.getRandomValues(nonce);
        return {
            initial_nonce: nonce,
            signatures: [],
            uuid: window.crypto.randomUUID(),
        };
    }

    /**
     * Signs the current card payload.
     * Takes the last signature (or initial nonce) and appends a new signature.
     */
    async signCard(card: Card, own_name: string): Promise<Card> {
        // The payload to sign is the most recent piece of the chain
        const payloadToSign =
            card.signatures.length > 0
                ? card.signatures[card.signatures.length - 1].signature
                : card.initial_nonce;

        const signature = await window.crypto.subtle.sign(
            {
                name: "ECDSA",
                hash: { name: "SHA-256" },
            },
            this.keyPair.privateKey,
            payloadToSign.buffer as ArrayBuffer,
        );

        return {
            ...card,
            signatures: [
                ...card.signatures,
                {
                    signature: new Uint8Array(signature),
                    author: own_name,
                },
            ],
        };
    }

    /**
     * Verifies that all signatures currently attached to the card are valid[cite: 23].
     * This iterates through the signature chain.
     */
    async verifyCard(
        card: Card,
        players: { [key: string]: Player | undefined },
    ): Promise<boolean> {
        let currentPayload = card.initial_nonce;

        for (let i = 0; i < card.signatures.length; i++) {
            const signature = card.signatures[i].signature;
            const publicKeyRaw = players[card.signatures[i].author]?.public_key;

            if (publicKeyRaw == null) return false;

            const publicKey = await window.crypto.subtle.importKey(
                "raw",
                publicKeyRaw.buffer as ArrayBuffer,
                { name: "ECDSA", namedCurve: "P-256" },
                true,
                ["verify"],
            );

            const isValid = await window.crypto.subtle.verify(
                {
                    name: "ECDSA",
                    hash: { name: "SHA-256" },
                },
                publicKey,
                signature.buffer as ArrayBuffer,
                currentPayload.buffer as ArrayBuffer,
            );

            if (!isValid) return false;

            // In this specific PTP algorithm, each signature signs the previous signature
            currentPayload = signature;
        }

        return true;
    }

    /**
     * Verifies a known card (one that has been played) against its published hash[cite: 22].
     */
    async verifyKnownCard(
        card: KnownCard,
        expectedHash: Uint8Array,
        players: { [key: string]: Player | undefined },
    ): Promise<boolean> {
        // 1. Verify the signature chain [cite: 23]
        const signaturesValid = await this.verifyCard(card, players);
        if (!signaturesValid) return false;

        // 2. Verify the hash matches h1(rN) [cite: 22]
        const finalSignature = card.signatures[card.signatures.length - 1];
        const actualHash = await window.crypto.subtle.digest(
            "SHA-256",
            finalSignature.signature.buffer as ArrayBuffer,
        );

        const actualHashArray = new Uint8Array(actualHash);
        return actualHashArray.every(
            (val, index) => val === expectedHash[index],
        );
    }
}
