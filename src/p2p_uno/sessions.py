import logging
import secrets
import uuid
from dataclasses import dataclass
from typing import Any, Callable

import ecdsa
import pydantic
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing_extensions import Coroutine

from p2p_uno.signatures import Verifier
from p2p_uno.util import decode_b64, encode_b64

logger = logging.getLogger(__name__)


class IceServer(pydantic.BaseModel):
    urls: str | list[str]
    credential: str | None = None
    username: str | None = None


ICE_SERVERS = [
    IceServer(urls="stun:stun1.l.google.com:19302"),
    IceServer(urls="stun:stun2.l.google.com:19302"),
]

app = FastAPI()


@dataclass
class Player:
    name: str
    public_key: bytes
    accepted: bool
    websocket: WebSocket
    on_ice_candidate: Callable[[str, dict[str, Any], str], Coroutine]
    verifier: Verifier


class PlayerNotFound(RuntimeError):
    def __init__(self, name: str) -> None:
        super().__init__(f"Player {name} could not be found")


class PlayerAlreadyExists(RuntimeError):
    def __init__(self, name: str) -> None:
        super().__init__(f"Player {name} already exists")


class Session:
    def __init__(self) -> None:
        self.players: dict[str, Player] = {}

    def add_player(self, player: Player):
        if player.name in self.players:
            raise PlayerAlreadyExists(player.name)
        self.players[player.name] = player

    def remove_player(self, name: str):
        if name not in self.players:
            raise PlayerNotFound(name)
        del self.players[name]

    def get_players(self) -> list[Player]:
        return list(self.players.values())

    def player_count(self) -> int:
        return len(self.get_players())

    def verify_proof(
        self,
        signer: str,
        signature: dict[str, bytes],
        nonce: bytes,
    ) -> bool:
        # Check that all players have signed, the signer themselve should not sign
        if len(signature) != self.player_count() - 1 or signer in signature:
            raise ValueError("Not all players have signed")

        for name, sig in signature.items():
            player = self.players.get(name, None)
            if player is None:
                raise PlayerNotFound(name)
            if not player.verifier.verify(sig, nonce):
                return False
        return True

    async def send_message(
        self, sender: str, recipient: str, payload: dict[str, Any], ice_type: str
    ):
        player = self.players.get(recipient, None)
        if player is None:
            raise PlayerNotFound(recipient)
        await player.on_ice_candidate(sender, payload, ice_type)


SESSIONS: dict[str, Session] = {}


@app.post("/")
async def create_session():
    session_id = uuid.uuid4()
    session = Session()
    SESSIONS[str(session_id)] = session
    logger.debug(f"Created session {session_id}")
    return {"session_id": session_id}


@app.get("/")
async def get_sessions():
    return list(SESSIONS.keys())


class PlayerMessage(pydantic.BaseModel):
    sender: str
    payload: dict[str, Any]


class JoinMessage(pydantic.BaseModel):
    name: str
    public_key: str


class IncomingIce(pydantic.BaseModel):
    recipient: str
    payload: dict[str, Any]
    ice_type: str


class OutgoingIce(pydantic.BaseModel):
    sender: str
    payload: dict[str, Any]
    ice_type: str


class SessionInfoMessage(pydantic.BaseModel):
    player_keys: dict[str, str]
    challenge_nonce: str
    ice_servers: list[IceServer]


class ChallengeProofMessage(pydantic.BaseModel):
    player_payloads: dict[str, str]


@app.websocket("/{session_id}")
async def join_session(websocket: WebSocket, session_id: str):
    session = SESSIONS.get(session_id)
    if session is None:
        logger.error(f"Session {session_id} not found")
        await websocket.close(code=1008)
        return
    await websocket.accept()
    request = JoinMessage.model_validate(await websocket.receive_json())
    logger.debug(f"Player {request.name} joined session {session_id}")

    async def on_message(sender: str, message: dict[str, Any], ice_type: str):
        logger.debug(f"Received message from {sender}: {message}")
        await websocket.send_json(
            OutgoingIce(
                sender=sender,
                payload=message,
                ice_type=ice_type,
            ).model_dump()
        )

    public_key = decode_b64(request.public_key)
    verifier = Verifier(public_key)
    player = Player(
        name=request.name,
        public_key=public_key,
        # First player should be automatically accepted
        accepted=session.player_count() == 0,
        websocket=websocket,
        on_ice_candidate=on_message,
        verifier=verifier,
    )
    session.add_player(player)
    logger.debug(f"Added player {player} to session")
    nonce = secrets.token_bytes(32)
    challenge_nonce = encode_b64(nonce)
    logger.debug(f"Generated challenge nonce {challenge_nonce}")
    await websocket.send_json(
        SessionInfoMessage(
            player_keys={
                player.name: encode_b64(player.public_key)
                for player in session.get_players()
                if player.name != request.name
            },
            challenge_nonce=challenge_nonce,
            ice_servers=ICE_SERVERS,
        ).model_dump()
    )
    logger.debug(f"Sent session info to {player.name}")

    try:
        while True:
            message = await websocket.receive_json()
            logger.debug(f"Received message from {player.name}: {message}")
            if message["type"] == "ice":
                ice_msg = IncomingIce.model_validate(message)
                await session.send_message(
                    request.name,
                    ice_msg.recipient,
                    ice_msg.payload,
                    ice_msg.ice_type,
                )
            elif message["type"] == "proof":
                proof = ChallengeProofMessage.model_validate(message)
                try:
                    verified = session.verify_proof(
                        request.name,
                        {
                            name: decode_b64(value)
                            for name, value in proof.player_payloads.items()
                        },
                        nonce,
                    )
                except ecdsa.BadSignatureError:
                    verified = False
                if verified:
                    logger.debug(f"Player {request.name} verified")
                    player.accepted = True
                else:
                    logger.debug(f"Player {request.name} failed verification")
                    player.accepted = False
                    await websocket.close()
                    return
    except WebSocketDisconnect:
        ...
