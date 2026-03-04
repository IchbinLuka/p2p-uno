import { AsyncQueue } from "./async_queue";
import { PlayerError } from "./errors";
import {
    COMMUNICATION_CHANNEL_NAME,
    IceType,
    type IncomingIce,
} from "./ice_messaging";
import { Semaphore } from "./semaphore";
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
    CONNECTION_REPAIR = "connection_repair",
}

export type Message =
    | SignCardMessage
    | DrawCard
    | FinalizeCardDraw
    | PlayCard
    | KickVote
    | SkipTurn
    | ConnectionRepair;

export interface ConnectionRepair {
    type: MessageType.CONNECTION_REPAIR;
    message: IncomingIce;
    destination: string;
}

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

export interface DrawCard {
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
    sent_offer: boolean;
    rtc_connection: RTCPeerConnection;
    channel: RTCDataChannel;
}

type MessageListener = (message: PlayerMessage) => boolean;

export class ConnectionRouter {
    private readonly player_connections: PlayerConnection[];
    private readonly sign_manager: SignManager;
    private readonly seen_messages: Set<string> = new Set();
    readonly message_queue: AsyncQueue<PlayerMessage> = new AsyncQueue();
    private buffered_messages: PlayerMessage[] = [];
    private readonly listeners: Set<MessageListener> = new Set();
    private readonly players: Record<string, PlayerGame>;
    private readonly message_mutex: Semaphore = new Semaphore(1);
    private readonly own_name: string;

    constructor(
        player_connections: PlayerConnection[],
        sign_manager: SignManager,
        players: Record<string, PlayerGame>,
        own_name: string,
    ) {
        this.own_name = own_name;
        this.player_connections = player_connections;
        this.players = players;
        this.sign_manager = sign_manager;
        for (const conn of this.player_connections) {
            this.add_datachannel(conn);
            conn.rtc_connection.addEventListener("datachannel", (event) => {
                if (event.channel.label !== COMMUNICATION_CHANNEL_NAME) return;
                conn.channel = event.channel;
                this.add_datachannel(conn);
            });
            // Try to repair edge if the connection fails
            conn.rtc_connection.addEventListener(
                "connectionstatechange",
                (_event) => {
                    if (conn.rtc_connection.connectionState !== "failed") {
                        return;
                    }
                    // Only create an offer if we were the one who initially sent the
                    // offer. Otherwise just wait for an offer from the other peer.
                    if (conn.sent_offer) {
                        (async () => {
                            const offer =
                                await conn.rtc_connection.createOffer();
                            const data_channel =
                                conn.rtc_connection.createDataChannel(
                                    COMMUNICATION_CHANNEL_NAME,
                                    { ordered: true },
                                );
                            conn.channel = data_channel;
                            this.add_datachannel(conn);

                            this.distribute(
                                await this.sign_manager.signMessage(
                                    {
                                        type: MessageType.CONNECTION_REPAIR,
                                        message: {
                                            type: "ice",
                                            ice_type: IceType.Offer,
                                            payload: offer,
                                            sender: own_name,
                                        },
                                        destination: conn.player,
                                    } satisfies ConnectionRepair,
                                    own_name,
                                ),
                            );
                        })().catch((error) => console.error(error));
                    }
                },
            );
        }
    }

    add_datachannel(conn: PlayerConnection) {
        conn.channel.addEventListener("message", (event) =>
            this.on_message(event.data as string, conn.player),
        );
    }

    async handle_ice(message: IncomingIce) {
        const connection = this.player_connections.find(
            (conn) => conn.player === message.sender,
        );
        if (!connection) return;
        switch (message.ice_type) {
            case IceType.Candidate: {
                await connection.rtc_connection.addIceCandidate(
                    message.payload,
                );
                break;
            }
            case IceType.Answer: {
                await connection.rtc_connection.setRemoteDescription(
                    message.payload as RTCSessionDescriptionInit,
                );
                break;
            }
            case IceType.Offer: {
                await connection.rtc_connection.setRemoteDescription(
                    message.payload as RTCSessionDescriptionInit,
                );
                const answer = await connection.rtc_connection.createAnswer();
                this.distribute(
                    await this.sign_manager.signMessage(
                        {
                            type: MessageType.CONNECTION_REPAIR,
                            destination: message.sender,
                            message: {
                                type: "ice",
                                ice_type: IceType.Answer,
                                payload: answer,
                                sender: this.own_name,
                            },
                        } satisfies ConnectionRepair,
                        this.own_name,
                    ),
                );
            }
        }
    }

    distribute(message: PlayerMessage) {
        const serialized = serialize_message(message);
        this.seen_messages.add(serialized);
        for (const conn of this.player_connections) {
            conn.channel.send(serialized);
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
            await this.message_mutex.acquire();
            if (
                parsed.payload.type == MessageType.CONNECTION_REPAIR &&
                parsed.payload.destination === this.own_name
            ) {
                await this.handle_ice(parsed.payload.message);
                return;
            }
            if (
                !(await this.sign_manager.verifyMessage(parsed, this.players))
            ) {
                console.error(`Invalid signature for message: ${message}`);
                this.message_mutex.release();
                return; // TODO: should we do something here?
            }
            for (const forward_conn of this.player_connections) {
                if (forward_conn.player == source) continue;
                console.debug(
                    `Forwarding message to ${forward_conn.player}: ${message}`,
                );
                forward_conn.channel.send(message);
            }
            this.message_queue.enqueue(parsed);
            this.message_mutex.release();
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

    remove_connection(player: string) {
        const connection = this.player_connections.find(
            (conn) => conn.player === player,
        );
        if (connection) {
            this.player_connections.splice(
                this.player_connections.indexOf(connection),
                1,
            );
            connection.channel.close();
        }
    }

    close() {
        for (const conn of this.player_connections) {
            conn.rtc_connection.close();
            conn.channel.close();
        }
    }
}
