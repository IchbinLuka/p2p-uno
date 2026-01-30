import { b64_to_uint8, uint8_to_b64 } from "./serialization";
import type { SignManager } from "./signing";

enum IceType {
    Candidate = "candidate",
    Answer = "answer",
    Offer = "offer",
    SignRequest = "sign_request",
}

type WebsocketMessage = LobbyEnd | IncomingIce;

interface LobbyEnd {
    verified_players: {
        [key: string]: string;
    };
    type: "lobbyend";
}

interface IncomingIce {
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
    data_channel: RTCDataChannel;
    connection: RTCPeerConnection;
    public_key: Uint8Array;
}

export interface ConnectionResult {
    players: PlayerConnection[];
}

const HOST = "localhost:8000";

export async function create_session() {
    const response = await window.fetch(`http://${HOST}/sessions`, {
        method: "POST",
    });
    const { session_id } = JSON.parse(await response.text());
    return session_id;
}

export async function establish_connections(
    name: string,
    session_id: string,
    sign_manager: SignManager,
): Promise<ConnectionResult> {
    const websocket = new WebSocket(`ws://${HOST}/sessions/${session_id}`);
    // Wait until websocket is open
    await new Promise<void>((resolve, reject) => {
        websocket.onopen = () => resolve();
        websocket.onerror = (err) => reject(err);
    });

    const join_message: JoinMessage = {
        name,
        public_key: uint8_to_b64(sign_manager.publicKeyExported),
    };
    websocket.send(JSON.stringify(join_message));
    const session_info: SessionInfoMessage = await new Promise(
        (resolve, reject) => {
            websocket.onmessage = (msg) => resolve(JSON.parse(msg.data));
            websocket.onerror = (err) => reject(err);
        },
    );
    console.debug("Received session info:", session_info);

    const send_ice = (msg: OutgoingIce) => websocket.send(JSON.stringify(msg));

    const player_connections: { [key: string]: RTCPeerConnection } = {};
    const player_channels: { [key: string]: RTCDataChannel } = {};
    const player_keys: { [key: string]: Uint8Array } = {};
    const player_proofs: { [key: string]: string } = {};

    const handle_data_channel = (channel: RTCDataChannel, p: string) => {
        console.log("Data channel created");
        player_channels[p] = channel;
        channel.onmessage = async (msg) => {
            console.log(`Received message from player ${p}: ${msg}`);
            const request: SignMessage = JSON.parse(msg.data);
            if (request.type == SignMessageType.REQUEST) {
                const signature = await sign_manager.signPayload(
                    b64_to_uint8(request.nonce),
                );
                const message: SignResponse = {
                    type: SignMessageType.RESPONSE,
                    signature: uint8_to_b64(signature),
                    nonce: request.nonce,
                    key: uint8_to_b64(sign_manager.publicKeyExported),
                };
                player_channels[p].send(JSON.stringify(message));
            } else if (p in session_info.player_keys) {
                // If the player is not in player keys, we do not need a proof
                if (request.nonce !== session_info.challenge_nonce) {
                    // We got the wrong message
                    throw new Error("Invalid nonce");
                }
                player_proofs[p] = request.signature;
                player_keys[p] = b64_to_uint8(request.key);
                // Check if we have collected all required proofs
                if (
                    Object.keys(player_proofs).length ==
                    Object.keys(session_info.player_keys).length
                ) {
                    websocket.send(
                        JSON.stringify({
                            type: "proof",
                            player_payloads: player_proofs,
                        } satisfies ChallengeProof),
                    );
                }
            }
        }; // on_message
        const message: SignRequest = {
            nonce: session_info.challenge_nonce,
            type: SignMessageType.REQUEST,
        };
        console.log("Sending message:", message);
        channel.onopen = () => channel.send(JSON.stringify(message));
    }; // on_datachannel

    const lobby_end = await new Promise<LobbyEnd>((resolve) => {
        const create_connection = (p: string) => {
            const connection = new RTCPeerConnection({
                iceServers: session_info.ice_servers,
            });
            connection.onicegatheringstatechange = () => {
                console.debug(
                    `Ice gathering state changed for player ${p}: ${connection.iceGatheringState}`,
                );
            };
            connection.oniceconnectionstatechange = () => {
                console.debug(
                    `Ice connection state changed for player ${p}: ${connection.iceConnectionState}`,
                );
            };
            connection.onconnectionstatechange = (_e) => {
                console.debug(
                    `Connection state changed for player ${p}: ${connection.connectionState}`,
                );
            };
            connection.ondatachannel = (e) => {
                handle_data_channel(e.channel, p);
            };
            connection.onicecandidate = (event) => {
                if (event.candidate == null) return;
                send_ice({
                    type: "ice",
                    recipient: p,
                    payload: event.candidate,
                    ice_type: IceType.Candidate,
                });
            };
            return connection;
        };

        for (const player of Object.keys(session_info.player_keys)) {
            const connection = create_connection(player);
            player_connections[player] = connection;
            const data_channel =
                connection.createDataChannel("game_communication");
            handle_data_channel(data_channel, player);
            connection.createOffer().then((offer) => {
                connection.setLocalDescription(offer);
                send_ice({
                    type: "ice",
                    recipient: player,
                    payload: offer,
                    ice_type: IceType.Offer,
                });
            });
        }

        const pending_ice: { [key: string]: RTCIceCandidate[] } = {};
        websocket.onmessage = async (msg) => {
            const parsed: WebsocketMessage = JSON.parse(msg.data);

            console.log(`Received message: ${JSON.stringify(parsed)}`);

            if (parsed.type === "lobbyend") {
                resolve(parsed);
                return;
            }

            const connection = player_connections[parsed.sender];

            switch (parsed.ice_type) {
                case IceType.Answer:
                    connection.setRemoteDescription(
                        parsed.payload as RTCSessionDescriptionInit,
                    );
                    break;
                case IceType.Candidate:
                    if (connection == null) {
                        if (!(parsed.sender in pending_ice)) {
                            pending_ice[parsed.sender] = [];
                        }
                        pending_ice[parsed.sender].push(
                            parsed.payload as RTCIceCandidate,
                        );
                    }
                    connection.addIceCandidate(parsed.payload);
                    break;
                case IceType.Offer: {
                    if (parsed.sender in player_connections) {
                        player_connections[parsed.sender].close();
                        delete player_connections[parsed.sender];
                    }
                    player_connections[parsed.sender] = create_connection(
                        parsed.sender,
                    );
                    player_connections[parsed.sender].setRemoteDescription(
                        parsed.payload as RTCSessionDescriptionInit,
                    );
                    const answer =
                        await player_connections[parsed.sender].createAnswer();
                    player_connections[parsed.sender].setLocalDescription(
                        answer,
                    );
                    send_ice({
                        type: "ice",
                        recipient: parsed.sender,
                        payload: answer,
                        ice_type: IceType.Answer,
                    });
                    if (parsed.sender in pending_ice) {
                        for (const candidate of pending_ice[parsed.sender]) {
                            player_connections[parsed.sender].addIceCandidate(
                                candidate,
                            );
                        }
                        delete pending_ice[parsed.sender];
                    }
                    break;
                }
            } // switch
        }; // on_message
    });

    const result: PlayerConnection[] = [];

    for (const [player, key] of Object.entries(lobby_end.verified_players)) {
        result.push({
            name: player,
            data_channel: player_channels[key],
            connection: player_connections[key],
            public_key: b64_to_uint8(key),
        });
    }

    return {
        players: result,
    };
}
