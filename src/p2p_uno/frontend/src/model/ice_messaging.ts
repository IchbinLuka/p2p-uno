import type { MMServer } from "./api";
import { b64_to_uint8, uint8_to_b64 } from "./serialization";
import type { SignManager } from "./signing";
import type { CardType } from "./types";

export enum IceType {
    Candidate = "candidate",
    Answer = "answer",
    Offer = "offer",
}

type WebsocketMessage = LobbyEnd | IncomingIce;

interface LobbyEnd {
    session_handle: string;
    type: "lobbyend";
}

interface SessionHandle {
    verified_players: { name: string; key: string }[];
    top_card: CardType;
}

export interface IncomingIce {
    sender: string;
    payload: object;
    ice_type: IceType;
    type: "ice";
}

interface OutgoingIce {
    type: "ice";
    recipient: string;
    ice_type: IceType;
    payload: object;
}

interface StartSession {
    type: "start";
}

enum SignMessageType {
    REQUEST = "request",
    RESPONSE = "response",
}

type SignMessage = SignRequest | SignResponse;

interface SignRequest {
    type: SignMessageType.REQUEST;
    nonce: string;
}

interface SignResponse {
    type: SignMessageType.RESPONSE;
    nonce: string;
    signature: string;
    key: string;
}

interface ChallengeProof {
    type: "proof";
    player_payloads: { [key: string]: string };
}

interface JoinMessage {
    name: string;
    public_key: string;
}

interface SessionInfoMessage {
    player_keys: { [key: string]: string };
    challenge_nonce: string;
    ice_servers: RTCIceServer[];
}

export interface PlayerConnection {
    name: string;
    data_channel: RTCDataChannel | undefined;
    connection: RTCPeerConnection | undefined;
    public_key: Uint8Array;
    sent_offer: boolean;
}

export interface ConnectionResult {
    players: PlayerConnection[];
    top_card: CardType;
}

class WebsocketError extends Error {
    event: Event;
    constructor(event: Event) {
        super();
        this.event = event;
    }

    toString() {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return `WebsocketError: ${this.event.toString()}`;
    }
}

export interface PlayerStatus {
    player_name: string;
    connected: boolean;
}

export const COMMUNICATION_CHANNEL_NAME = "game_communication";

/**
 * This class implements the functionality for establishing the Peer-to-peer connections.
 */
export class ConnectionEstablishHandler {
    private player_connections: Record<string, RTCPeerConnection> = {};
    private player_channels: Record<string, RTCDataChannel> = {};
    private player_keys: Record<string, Uint8Array> = {};
    private player_proofs: Record<string, string> = {};
    private pending_ice: Record<string, RTCIceCandidate[]> = {};
    private sign_manager: SignManager;
    private session_info: SessionInfoMessage;
    private websocket: WebSocket;
    private on_update: (players: PlayerStatus[]) => void;
    private on_finished: (result: ConnectionResult) => void;

    private constructor(
        sign_manager: SignManager,
        session_info: SessionInfoMessage,
        websocket: WebSocket,
        on_update: (players: PlayerStatus[]) => void,
        on_finished: (result: ConnectionResult) => void,
    ) {
        this.sign_manager = sign_manager;
        this.session_info = session_info;
        this.websocket = websocket;
        this.on_update = on_update;
        this.on_finished = on_finished;
    }

    private handle_data_channel(channel: RTCDataChannel, peer_name: string) {
        console.log("Data channel created");
        this.player_channels[peer_name] = channel;
        channel.onmessage = async (msg) => {
            console.log(
                `Received message from player ${peer_name}: ${msg.data}`,
            );
            const request: SignMessage = JSON.parse(
                msg.data as string,
            ) as SignMessage;
            if (request.type == SignMessageType.REQUEST) {
                const signature = await this.sign_manager.signPayload(
                    b64_to_uint8(request.nonce),
                );
                const message: SignResponse = {
                    type: SignMessageType.RESPONSE,
                    signature: uint8_to_b64(signature),
                    nonce: request.nonce,
                    key: uint8_to_b64(this.sign_manager.publicKeyExported),
                };
                this.player_channels[peer_name].send(JSON.stringify(message));
            } else if (peer_name in this.session_info.player_keys) {
                // If the player is not in player keys, we do not need a proof
                if (request.nonce !== this.session_info.challenge_nonce) {
                    // We got the wrong message
                    throw new Error("Invalid nonce");
                }
                this.player_proofs[peer_name] = request.signature;
                this.player_keys[peer_name] = b64_to_uint8(request.key);
                // Check if we have collected all required proofs
                if (
                    Object.keys(this.player_proofs).length ==
                    Object.keys(this.session_info.player_keys).length
                ) {
                    this.websocket.send(
                        JSON.stringify({
                            type: "proof",
                            player_payloads: this.player_proofs,
                        } satisfies ChallengeProof),
                    );
                }
            }
        }; // on_message
        const message: SignRequest = {
            nonce: this.session_info.challenge_nonce,
            type: SignMessageType.REQUEST,
        };
        console.log("Sending message:", message);
        channel.onopen = () => {
            this.on_update(
                Object.entries(this.player_channels).map(([p, channel]) => {
                    return {
                        player_name: p,
                        connected: channel.readyState === "open",
                    };
                }),
            );

            channel.send(JSON.stringify(message));
        };
    }

    private create_connection(peer_name: string) {
        const connection = new RTCPeerConnection({
            iceServers: this.session_info.ice_servers,
        });
        connection.onicegatheringstatechange = () => {
            console.debug(
                `Ice gathering state changed for player ${peer_name}: ${connection.iceGatheringState}`,
            );
        };
        connection.oniceconnectionstatechange = () => {
            console.debug(
                `Ice connection state changed for player ${peer_name}: ${connection.iceConnectionState}`,
            );
        };
        connection.onconnectionstatechange = (_e) => {
            console.debug(
                `Connection state changed for player ${peer_name}: ${connection.connectionState}`,
            );
        };
        connection.ondatachannel = (e) => {
            this.handle_data_channel(e.channel, peer_name);
        };
        connection.onicecandidate = (event) => {
            if (event.candidate == null) return;
            this.send_ice({
                type: "ice",
                recipient: peer_name,
                payload: event.candidate,
                ice_type: IceType.Candidate,
            });
        };
        return connection;
    }

    private send_ice(msg: OutgoingIce) {
        this.websocket.send(JSON.stringify(msg));
    }

    private handle_lobby_end(end_msg: LobbyEnd) {
        const result: PlayerConnection[] = [];

        const handle = JSON.parse(end_msg.session_handle) as SessionHandle;

        for (const channel of Object.values(this.player_channels)) {
            channel.onmessage = null;
        }

        for (const { name, key } of handle.verified_players) {
            result.push({
                name,
                data_channel: this.player_channels[name],
                connection: this.player_connections[name],
                sent_offer: name in this.player_proofs,
                public_key: b64_to_uint8(key),
            });
        }

        this.on_finished({ players: result, top_card: handle.top_card });
    }

    private async on_message(msg: WebsocketMessage) {
        console.log(`Received message: ${JSON.stringify(msg)}`);

        if (msg.type === "lobbyend") {
            this.handle_lobby_end(msg);
            return;
        }

        const connection = this.player_connections[msg.sender];

        switch (msg.ice_type) {
            case IceType.Answer:
                await connection.setRemoteDescription(
                    msg.payload as RTCSessionDescriptionInit,
                );
                break;
            case IceType.Candidate:
                if (connection == null) {
                    if (!(msg.sender in this.pending_ice)) {
                        this.pending_ice[msg.sender] = [];
                    }
                    this.pending_ice[msg.sender].push(
                        msg.payload as RTCIceCandidate,
                    );
                }
                await connection.addIceCandidate(msg.payload);
                break;
            case IceType.Offer: {
                if (msg.sender in this.player_connections) {
                    this.player_connections[msg.sender].close();
                    delete this.player_connections[msg.sender];
                }
                this.player_connections[msg.sender] = this.create_connection(
                    msg.sender,
                );
                await this.player_connections[msg.sender].setRemoteDescription(
                    msg.payload as RTCSessionDescriptionInit,
                );
                const answer =
                    await this.player_connections[msg.sender].createAnswer();
                await this.player_connections[msg.sender].setLocalDescription(
                    answer,
                );
                this.send_ice({
                    type: "ice",
                    recipient: msg.sender,
                    payload: answer,
                    ice_type: IceType.Answer,
                });
                if (msg.sender in this.pending_ice) {
                    for (const candidate of this.pending_ice[msg.sender]) {
                        await this.player_connections[
                            msg.sender
                        ].addIceCandidate(candidate);
                    }
                    delete this.pending_ice[msg.sender];
                }
                break;
            }
        } // switch
    }

    static async create(
        name: string,
        session_id: string,
        server: MMServer,
        sign_manager: SignManager,
        on_update: (players: PlayerStatus[]) => void,
        on_session_start: (result: ConnectionResult) => void,
    ): Promise<ConnectionEstablishHandler> {
        console.debug("Opening websocket");
        const websocket = new WebSocket(
            `${server.wsUrl}/sessions/${session_id}`,
        );
        // Wait until websocket is open
        await new Promise<void>((resolve, reject) => {
            websocket.onopen = () => resolve();
            websocket.onerror = (err) => reject(new WebsocketError(err));
        });

        const join_message: JoinMessage = {
            name,
            public_key: uint8_to_b64(sign_manager.publicKeyExported),
        };
        websocket.send(JSON.stringify(join_message));
        const session_info: SessionInfoMessage = await new Promise(
            (resolve, reject) => {
                websocket.onmessage = (msg) =>
                    resolve(
                        JSON.parse(msg.data as string) as SessionInfoMessage,
                    );
                websocket.onerror = (event) =>
                    reject(new WebsocketError(event));
            },
        );
        const handler = new ConnectionEstablishHandler(
            sign_manager,
            session_info,
            websocket,
            on_update,
            on_session_start,
        );
        websocket.onmessage = (msg) => {
            handler
                .on_message(JSON.parse(msg.data as string) as WebsocketMessage)
                .catch((e) => {
                    console.error("Error handling message:", e);
                });
        };
        console.debug("Received session info:", session_info);
        for (const player of Object.keys(session_info.player_keys)) {
            const connection = handler.create_connection(player);
            handler.player_connections[player] = connection;
            const data_channel = connection.createDataChannel(
                COMMUNICATION_CHANNEL_NAME,
                { ordered: true },
            );
            handler.handle_data_channel(data_channel, player);
            connection
                .createOffer()
                .then(async (offer) => {
                    await connection.setLocalDescription(offer);
                    handler.send_ice({
                        type: "ice",
                        recipient: player,
                        payload: offer,
                        ice_type: IceType.Offer,
                    });
                })
                .catch((error) => {
                    console.error(
                        `Error creating offer for ${player}: ${error}`,
                    );
                });
        }
        return handler;
    }

    start_session() {
        this.websocket.send(
            JSON.stringify({ type: "start" } satisfies StartSession),
        );
    }
}
