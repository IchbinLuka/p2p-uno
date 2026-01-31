import { PlayerError } from "./errors";
import { deserialize_message } from "./serialization";
import type { SignManager } from "./signing";
import type { Card, KnownCard, Player } from "./types";

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
    KICK_VOTE = "kick_vote",
}

export type Message =
    | SignCardMessage
    | DrawCardRequest
    | FinalizeCardDraw
    | PlayCard
    | KickVote;

export interface SignCardMessage {
    // Fixing an enum variant here allows for smart casting
    type: MessageType.SIGN_CARD;
    card_nonce: Uint8Array;
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
    card_hash: Uint8Array;
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

export interface ConnectionManager {
    await_message(player: Player, types: MessageType[]): Promise<Message>;
    add_kick_vote_listener(listener: KickListener): void;
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

class ConnectionRouter {
    private player_connections: PlayerConnection[];
    private sign_manager: SignManager;
    private seen_messages: Set<string> = new Set();
    private buffered_messages: PlayerMessage[] = [];
    private listeners: Set<MessageListener> = new Set();

    constructor(
        player_connections: PlayerConnection[],
        sign_manager: SignManager,
        players: { [key: string]: Player | undefined },
    ) {
        this.player_connections = player_connections;
        this.sign_manager = sign_manager;
        for (const conn of this.player_connections) {
            conn.channel.addEventListener("message", (event) => {
                const data = event.data as string; // TODO: Check if string is correct
                if (this.seen_messages.has(data)) {
                    return; // We already handled this message
                }
                this.seen_messages.add(data);
                const message = deserialize_message(data) as PlayerMessage;
                void (async () => {
                    if (
                        !(await this.sign_manager.verifyMessage(
                            message,
                            players,
                        ))
                    ) {
                        return; // TODO: should we do something here?
                    }
                    for (const forward_conn of this.player_connections) {
                        if (forward_conn.player == conn.player) continue;
                        forward_conn.channel.send(data);
                    }
                    let handled = false;
                    for (const listener of this.listeners) {
                        handled = handled || listener(message);
                    }
                    if (!handled) {
                        if (this.buffered_messages.length > 1000) {
                            this.buffered_messages.shift();
                        }
                        this.buffered_messages.push(message);
                    }
                })();
            });
        }
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

export class ConnectionManagerImpl implements ConnectionManager {
    private kick_listeners: KickListener[] = [];
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

    await_message(player: Player, types: MessageType[]): Promise<Message> {
        return new Promise((resolve, reject) => {
            const callback = (msg: PlayerMessage) => {
                if (msg.player !== player.name) return false;
                this.router.remove_listener(callback);
                if (!types.includes(msg.payload.type)) {
                    reject(
                        new UnexpectedMessageType(
                            types,
                            msg.payload.type,
                            player.name,
                        ),
                    );
                    return false;
                }
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
