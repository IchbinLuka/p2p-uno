import { PlayerError } from "./errors";
import { deserialize_message, serialize_message } from "./serialization";
import type { SignManager } from "./signing";
import type { Card, KnownCard, PlayerGame } from "./types";

export class UnexpectedMessageType extends PlayerError {
    expected: MessageType[];
    actual: MessageType;

    constructor(expected: MessageType[], actual: MessageType, player: string) {
        super(player);
        this.expected = expected;
        this.actual = actual;
    }

    toString() {
        return `Unexpected Message Type: ${this.actual}. Expected one of ${JSON.stringify(this.expected)}`;
    }
}

export enum MessageType {
    SIGN_CARD = "sign_card",
    DRAW_CARD_REQUEST = "draw_card_request",
    FINALIZE_CARD_DRAW = "finalize_card_draw",
    PLAY_CARD = "play_card",
    SKIP_TURN = "skip",
    KICK_VOTE = "kick_vote",
}

export type Message =
    | SignCardMessage
    | DrawCardRequest
    | FinalizeCardDraw
    | PlayCard
    | KickVote
    | SkipTurn;

export interface SkipTurn {
    type: MessageType.SKIP_TURN;
    // We need to add some kind of nonce to the message. Otherwise it would be empty
    // and could therefore be faked by other peers
    nonce: Uint8Array;
}

export interface SignCardMessage {
    // Fixing an enum variant here allows for smart casting
    type: MessageType.SIGN_CARD;
    // card_nonce: Uint8Array;
    signature: Uint8Array;
}

export interface DrawCardRequest {
    type: MessageType.DRAW_CARD_REQUEST;
    initial_card: Card;
}

export interface FinalizeCardDraw {
    type: MessageType.FINALIZE_CARD_DRAW;
    card_hash: Uint8Array;
}

export interface PlayCard {
    type: MessageType.PLAY_CARD;
    // card_hash: Uint8Array;
    card: KnownCard;
}

export interface KickVote {
    type: MessageType.KICK_VOTE;
    player: string;
    reason: string;
}

export type KickListener = (
    violation: string,
    author: string,
    target: string,
) => void;

export type MessageRequestListener = () => Promise<void>;

export interface ConnectionManager {
    await_message(player_name: string, types: MessageType[]): Promise<Message>;
    add_kick_vote_listener(listener: KickListener): void;
    manual_send(message: PlayerMessage): void;
    add_manual_message_resolver(
        player_name: string,
        message_type: MessageType,
        listener: MessageRequestListener,
    ): void;
    remove_manual_message_resolver(
        player_name: string,
        message_type: MessageType,
        listener: MessageRequestListener,
    ): void;
}

export interface PlayerMessage {
    player: string;
    signature: Uint8Array;
    payload: Message;
}

interface PlayerConnection {
    player: string;
    channel: RTCDataChannel;
}

type MessageListener = (message: PlayerMessage) => boolean;

export class ConnectionRouter {
    private player_connections: PlayerConnection[];
    private sign_manager: SignManager;
    private seen_messages: Set<string> = new Set();
    private buffered_messages: PlayerMessage[] = [];
    private listeners: Set<MessageListener> = new Set();
    private players: Record<string, PlayerGame>;

    constructor(
        player_connections: PlayerConnection[],
        sign_manager: SignManager,
        players: Record<string, PlayerGame>,
    ) {
        this.player_connections = player_connections;
        this.players = players;
        this.sign_manager = sign_manager;
        for (const conn of this.player_connections) {
            conn.channel.addEventListener("message", (event) =>
                this.on_message(event.data as string, conn.player),
            );
        }
    }

    /**
     * Handles a message received from a source connection.
     *
     * @param message The message received from the source connection.
     * @param source The source connection from which the message was received. Note that this may not
     *               be the author of the message. Can be set to null to indicate that the message does not
     *               originate from a remote connection, but rather a local interaction.
     */
    on_message(message: string, source: string | null) {
        console.debug(`Received message from ${source}: ${message}`);
        if (this.seen_messages.has(message)) {
            console.debug(`Already handled message: ${message}`);
            return; // We already handled this message
        }
        this.seen_messages.add(message);
        const parsed = deserialize_message(message) as PlayerMessage;
        void (async () => {
            if (
                !(await this.sign_manager.verifyMessage(parsed, this.players))
            ) {
                console.error(`Invalid signature for message: ${message}`);
                return; // TODO: should we do something here?
            }
            for (const forward_conn of this.player_connections) {
                if (forward_conn.player == source) continue;
                console.debug(
                    `Forwarding message to ${forward_conn.player}: ${message}`,
                );
                forward_conn.channel.send(message);
            }
            let handled = false;
            console.debug(`Sending to ${this.listeners.size} listeners`);
            for (const listener of this.listeners) {
                handled = handled || listener(parsed);
            }
            if (!handled) {
                if (this.buffered_messages.length > 1000) {
                    this.buffered_messages.shift();
                }
                console.debug(`Buffered message: ${message}`);
                this.buffered_messages.push(parsed);
            }
        })();
    }

    add_listener(listener: MessageListener) {
        this.listeners.add(listener);
        this.buffered_messages = this.buffered_messages.filter(
            (msg) => !listener(msg),
        );
    }

    remove_listener(listener: MessageListener) {
        this.listeners.delete(listener);
    }
}

function stringify_listeners(
    listeners: Map<string, Set<MessageRequestListener>>,
) {
    return Array.from(listeners.entries())
        .map(([key, value]) => {
            return `${key} -> ${Array.from(value)
                .map((listener) => listener.name)
                .join(", ")}`;
        })
        .join("\n");
}

function listener_key(player_name: string, message_type: MessageType): string {
    return `${player_name}:${message_type}`;
}

export class ConnectionManagerImpl implements ConnectionManager {
    private kick_listeners: KickListener[] = [];
    private message_resolvers: Map<string, Set<MessageRequestListener>> =
        new Map();
    private router: ConnectionRouter;

    constructor(router: ConnectionRouter) {
        this.router = router;
        this.router.add_listener((msg) => {
            if (msg.payload.type == MessageType.KICK_VOTE) {
                for (const listener of this.kick_listeners) {
                    const vote = msg.payload;
                    listener(vote.reason, msg.player, vote.player);
                }
                return true;
            }
            return false;
        });
    }

    add_manual_message_resolver(
        player_name: string,
        message_type: MessageType,
        listener: MessageRequestListener,
    ): void {
        const key = listener_key(player_name, message_type);
        if (!this.message_resolvers.has(key)) {
            this.message_resolvers.set(key, new Set());
        }
        this.message_resolvers.get(key)!.add(listener);
    }

    remove_manual_message_resolver(
        player_name: string,
        message_type: MessageType,
        listener: MessageRequestListener,
    ): void {
        const key = listener_key(player_name, message_type);
        if (!this.message_resolvers.has(key)) {
            return;
        }
        const listeners = this.message_resolvers.get(key)!;
        listeners.delete(listener);
        if (listeners.size === 0) {
            this.message_resolvers.delete(key);
        }
    }

    manual_send(message: PlayerMessage): void {
        this.router.on_message(serialize_message(message), null);
    }

    async await_message(
        player_name: string,
        types: MessageType[],
    ): Promise<Message> {
        console.debug(
            `Awaiting ${JSON.stringify(types)} message from ${player_name}`,
        );
        console.debug(
            `Listeners: ${stringify_listeners(this.message_resolvers)}`,
        );
        // Invoke manual handlers
        for (const type of types) {
            const listeners = this.message_resolvers.get(
                listener_key(player_name, type),
            );
            // console.debug(`Listeners for ${player_name}:${type}: ${listeners}`);
            if (listeners == null) continue;
            for (const list of listeners) {
                await list();
            }
        }
        return new Promise((resolve, reject) => {
            const callback = (msg: PlayerMessage) => {
                if (msg.player !== player_name) return false;
                this.router.remove_listener(callback);
                if (!types.includes(msg.payload.type)) {
                    reject(
                        new UnexpectedMessageType(
                            types,
                            msg.payload.type,
                            player_name,
                        ),
                    );
                    return false;
                }
                console.debug(`Received ${msg.payload.type} message`);
                resolve(msg.payload);
                return true;
            };
            this.router.add_listener(callback);
        });
    }

    add_kick_vote_listener(listener: KickListener): void {
        this.kick_listeners.push(listener);
    }
}
