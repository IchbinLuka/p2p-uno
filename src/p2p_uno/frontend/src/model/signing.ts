import type { Message, PlayerMessage } from "./connection";
import { serialize_message } from "./serialization";
import { ALL_CARDS, type Card, type KnownCard, type Player } from "./types";

const ALGORITHM_PARAMS = {
    name: "ECDSA",
    namedCurve: "P-256",
    hash: { name: "SHA-256" },
};

type Players = Partial<Record<string, Player>>;

export interface SignManager {
    /**
     * Create a new random card sample containing an initial nonce and uuid.
     * The returned card has no signatures attached.
     *
     * @returns a freshly sampled `Card` with an `initial_nonce`, empty `signatures` and a `uuid`.
     */
    sampleCard(): Card;

    /**
     * Sign a card by appending a signature that covers the current tail of the
     * card's signature chain.
     *
     * @param card - Card to sign
     * @param own_name - author name to attach to the new signature
     * @returns a Promise resolving to the new Card with the appended signature
     */
    signCard(card: Card, own_name: string): Promise<Card>;

    /**
     * Verify the entire signature chain on a card.     *
     *
     * @param card - Card whose signatures to verify
     * @param players - mapping of player names to Player objects holding public keys
     * @returns a Promise resolving to `true` if all signatures verify, otherwise `false`
     */
    verifyCard(card: Card, players: Players): Promise<boolean>;

    /**
     * Verify a finalized/known card against an expected hash. This runs
     * `verifyCard` on the card's signature chain and then checks that the
     * published `hash` equals SHA-256(finalSignature).
     *
     * @param card - Known (finalized) card to verify
     * @param expectedHash - expected SHA-256 hash published for this card
     * @param players - mapping of player names to Player objects holding public keys
     * @returns a Promise resolving to `true` if signatures and hash match, otherwise `false`
     */
    verifyKnownCard(
        card: KnownCard,
        expectedHash: Uint8Array,
        players: Players,
    ): Promise<boolean>;

    /**
     * Finalize a card into a KnownCard. The card must have been last-signed by
     * `own_name`. Finalization computes SHA-256 over the last signature and
     * determines the card type by folding the signature bytes into an index.
     *
     * @param card - Card to finalize
     * @param own_name - name of the player finalizing the card (must match last signature author)
     * @returns a Promise resolving to the finalized KnownCard
     */
    finalizeCard(card: Card, own_name: string): Promise<KnownCard>;

    /**
     * Sign an arbitrary message payload and return a `PlayerMessage` containing
     * the signature, the player name and the original payload.
     *
     * @param message - message to sign
     * @param own_name - player name that produced the signature
     * @returns a Promise resolving to the signed PlayerMessage
     */
    signMessage(message: Message, own_name: string): Promise<PlayerMessage>;

    /**
     * Sign raw payload bytes and return the signature bytes.
     *
     * @param payload - bytes to sign
     * @returns a Promise resolving to the signature as a Uint8Array
     */
    signPayload(payload: Uint8Array): Promise<Uint8Array>;

    /**
     * Verify a `PlayerMessage` by looking up the author's public key in
     * `players` and verifying the signature against the serialized payload.
     *
     * @param message - PlayerMessage to verify
     * @param players - mapping of player names to Player objects holding public keys
     * @returns a Promise resolving to `true` if the signature is valid, otherwise `false`
     */
    verifyMessage(message: PlayerMessage, players: Players): Promise<boolean>;

    /**
     * Optionally expose the exported public key bytes for this manager.
     */
    publicKeyExported: Uint8Array;
}

export class SignManagerImpl implements SignManager {
    private keyPair!: CryptoKeyPair;
    public publicKeyExported!: Uint8Array;

    private constructor() {}

    /**
     * Initializes the SignManager.
     */
    static async init(): Promise<SignManager> {
        const manager = new SignManagerImpl();
        manager.keyPair = await window.crypto.subtle.generateKey(
            ALGORITHM_PARAMS,
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
            ALGORITHM_PARAMS,
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
     * Verifies that all signatures currently attached to the card are valid.
     * This iterates through the signature chain.
     */
    async verifyCard(card: Card, players: Players): Promise<boolean> {
        let currentPayload = card.initial_nonce;

        for (let i = 0; i < card.signatures.length; i++) {
            const signature = card.signatures[i].signature;
            const publicKeyRaw = players[card.signatures[i].author]?.public_key;

            if (publicKeyRaw == null) return false;

            const publicKey = await window.crypto.subtle.importKey(
                "raw",
                publicKeyRaw.buffer as ArrayBuffer,
                ALGORITHM_PARAMS,
                true,
                ["verify"],
            );

            const isValid = await window.crypto.subtle.verify(
                ALGORITHM_PARAMS,
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
     * Verifies a known card (one that has been played) against its published hash.
     */
    async verifyKnownCard(
        card: KnownCard,
        expectedHash: Uint8Array,
        players: Players,
    ): Promise<boolean> {
        // 1. Verify the signature chain
        const signaturesValid = await this.verifyCard(card, players);
        if (!signaturesValid) return false;

        // 2. Verify the hash matches h1(rN)
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

    async finalizeCard(card: Card, own_name: string): Promise<KnownCard> {
        if (card.signatures[card.signatures.length - 1].author !== own_name) {
            throw new Error(
                "Can only finalize cards last signed by the player.",
            );
        }
        // Hash last signature down to 0..ALL_CARDS.length-1
        const lastSignature = card.signatures[card.signatures.length - 1];
        const hash = await window.crypto.subtle.digest(
            "SHA-256",
            lastSignature.signature.buffer as ArrayBuffer,
        );
        const hashArray = new Uint8Array(hash);
        const index =
            lastSignature.signature.reduce((acc, val) => acc + val, 0) %
            ALL_CARDS.length;
        return {
            ...card,
            hash: hashArray,
            card_type: ALL_CARDS[index],
        };
    }

    async signMessage(
        message: Message,
        own_name: string,
    ): Promise<PlayerMessage> {
        const payloadToSign = new TextEncoder().encode(
            serialize_message(message),
        );
        console.debug(`Payload to sign: ${serialize_message(message)}`);

        const signature = await window.crypto.subtle.sign(
            ALGORITHM_PARAMS,
            this.keyPair.privateKey,
            payloadToSign.buffer,
        );
        return {
            player: own_name,
            signature: new Uint8Array(signature),
            payload: message,
        };
    }

    async signPayload(payload: Uint8Array): Promise<Uint8Array> {
        const signature = await window.crypto.subtle.sign(
            ALGORITHM_PARAMS,
            this.keyPair.privateKey,
            payload.buffer as ArrayBuffer,
        );
        return new Uint8Array(signature);
    }

    async verifyMessage(
        message: PlayerMessage,
        players: Players,
    ): Promise<boolean> {
        const player = message.player;
        const key = players[player]?.public_key;
        if (key == null) {
            console.error(`Player ${player} not found`);
            return false;
        }
        // console.debug(`Players: ${serialize_message(players)}`);
        // console.debug(`Own key: ${serialize_message(this.publicKeyExported)}`);
        // console.debug(`Checking with key: ${serialize_message(key)}`);

        const payload = new TextEncoder().encode(
            serialize_message(message.payload),
        );

        const publicKey = await window.crypto.subtle.importKey(
            "raw",
            key.buffer as ArrayBuffer,
            ALGORITHM_PARAMS,
            true,
            ["verify"],
        );

        const isValid = await window.crypto.subtle.verify(
            ALGORITHM_PARAMS,
            publicKey,
            message.signature.buffer as ArrayBuffer,
            payload.buffer,
        );

        return isValid;
    }
}
