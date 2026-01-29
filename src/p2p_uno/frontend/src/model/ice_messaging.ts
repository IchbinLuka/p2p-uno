import { b64_to_uint8, uint8_to_b64 } from "./serialization";
import type { SignManager } from "./signing";

enum IceType {
    Candidate = "candidate",
    Answer = "answer",
    Offer = "offer",
    SignRequest = "sign_request",
}

interface IncomingIce {
    sender: string;
    data: object;
    ice_type: IceType;
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
    ga;
    player_keys: { [key: string]: string };
    challenge_nonce: string;
}
const HOST = "localhost:8080";

export async function establish_connections(
    name: string,
    session_id: string,
    sign_manager: SignManager,
) {
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
            websocket.onmessage = (msg) => resolve(msg.data);
            websocket.onerror = (err) => reject(err);
        },
    );

    const send_ice = (msg: OutgoingIce) => websocket.send(JSON.stringify(msg));

    const player_connections: { [key: string]: RTCPeerConnection } = {};
    const player_channels: { [key: string]: RTCDataChannel } = {};

    const proof = await new Promise<ChallengeProof>((resolve) => {
        const player_proofs: { [key: string]: string } = {};
        const create_connection = (p: string) => {
            const connection = new RTCPeerConnection();
            connection.onicecandidate = (candidate) => {
                send_ice({
                    type: "ice",
                    recipient: p,
                    payload: candidate,
                    ice_type: IceType.Candidate,
                });
            };
            connection.ondatachannel = (event) => {
                player_channels[p] = event.channel;
                event.channel.onmessage = async (msg) => {
                    const request: SignMessage = JSON.parse(msg.data);
                    if (request.type == SignMessageType.REQUEST) {
                        const signature = await sign_manager.signPayload(
                            b64_to_uint8(request.nonce),
                        );
                        const message: SignResponse = {
                            type: SignMessageType.RESPONSE,
                            signature: uint8_to_b64(signature),
                            nonce: request.nonce,
                        };
                        player_channels[p].send(JSON.stringify(message));
                    } else {
                        if (request.nonce !== session_info.challenge_nonce) {
                            // We got the wrong message
                            throw new Error("Invalid nonce");
                        }
                        player_proofs[p] = request.signature;
                        if (
                            Object.keys(player_proofs).length ==
                            Object.keys(session_info.player_keys.length).length
                        ) {
                            resolve({
                                type: "proof",
                                player_payloads: player_proofs,
                            });
                        }
                    }
                };
                const message: SignRequest = {
                    nonce: session_info.challenge_nonce,
                    type: SignMessageType.REQUEST,
                };
                event.channel.send(JSON.stringify(message));
            };
            return connection;
        };

        for (const player of Object.keys(session_info.player_keys)) {
            player_connections[player] = create_connection(player);
            player_connections[player].createOffer().then((offer) => {
                player_connections[player].setLocalDescription(offer);
                player_connections[player].createDataChannel(
                    "game_communication",
                );
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
            const parsed: IncomingIce = JSON.parse(msg.data);
            const connection = player_connections[parsed.sender];

            switch (parsed.ice_type) {
                case IceType.Answer:
                    connection.setRemoteDescription(
                        parsed.data as RTCSessionDescriptionInit,
                    );
                    break;
                case IceType.Candidate:
                    if (connection == null) {
                        if (!(parsed.sender in pending_ice)) {
                            pending_ice[parsed.sender] = [];
                        }
                        pending_ice[parsed.sender].push(
                            parsed.data as RTCIceCandidate,
                        );
                    }
                    connection.addIceCandidate(parsed.data);
                    break;
                case IceType.Offer: {
                    if (parsed.sender in player_connections) {
                        player_connections[parsed.sender].close();
                        delete player_connections[parsed.sender];
                    }
                    player_connections[parsed.sender] = create_connection(
                        parsed.sender,
                    );
                    const answer =
                        await player_connections[parsed.sender].createAnswer();
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
            }
        };
    });
    websocket.send(JSON.stringify(proof));
}
