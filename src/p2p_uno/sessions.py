import base64
import secrets
import uuid
from dataclasses import dataclass
from typing import Any, Callable

import ecdsa
import pydantic
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()


@dataclass
class Player:
    name: str
    public_key: bytes
    accepted: bool
    websocket: WebSocket
    on_ice_candidate: Callable
    verifier: ecdsa.VerifyingKey


class PlayerNotFound(RuntimeError):
    def __init__(self, name: str) -> None:
        super().__init__(f"Player {name} could not be found")


class PlayerAlreadyExists(RuntimeError):
    def __init__(self, name: str) -> None:
        super().__init__(f"Player {name} already exists")


def decode_b64(b64: str) -> bytes:
    return base64.b64decode(b64)


def encode_b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


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

    async def send_message(self, sender: str, recipient: str, payload: dict[str, Any]):
        player = self.players.get(recipient, None)
        if player is None:
            raise PlayerNotFound(recipient)
        await player.on_ice_candidate(sender, payload)


SESSIONS: dict[str, Session] = {}


@app.post("/sessions")
async def create_session():
    session_id = uuid.uuid4()
    session = Session()
    SESSIONS[str(session_id)] = session
    return {"session_id": session_id}


class PlayerMessage(pydantic.BaseModel):
    sender: str
    payload: dict[str, Any]


class JoinMessage(pydantic.BaseModel):
    name: str
    public_key: str


class IceMessage(pydantic.BaseModel):
    target: str
    content: dict[str, Any]


class SessionInfoMessage(pydantic.BaseModel):
    player_keys: dict[str, str]
    challenge_nonce: str


class ChallengeProofMessage(pydantic.BaseModel):
    player_payloads: dict[str, str]


@app.websocket("/sessions/{session}")
async def join_session(websocket: WebSocket, session_id: str):
    session = SESSIONS.get(session_id)
    if session is None:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    request = JoinMessage.model_validate(await websocket.receive_json())

    async def on_message(message: dict[str, Any], sender: str):
        await websocket.send_json(
            PlayerMessage(
                sender=sender,
                payload=message,
            )
        )

    public_key = decode_b64(request.public_key)
    key = ecdsa.VerifyingKey.from_string(public_key, curve=ecdsa.NIST256p)
    player = Player(
        name=request.name,
        public_key=public_key,
        # First player should be automatically accepted
        accepted=session.player_count() == 0,
        websocket=websocket,
        on_ice_candidate=on_message,
        verifier=key,
    )
    session.add_player(player)
    nonce = bytes(secrets.randbits(4 * 8))
    challenge_nonce = base64.b64encode(nonce).decode()
    await websocket.send_json(
        SessionInfoMessage(
            player_keys={
                player.name: base64.b64encode(player.public_key).decode()
                for player in session.get_players()
            },
            challenge_nonce=challenge_nonce,
        ).model_dump()
    )

    try:
        while True:
            message = await websocket.receive_json()
            if message["type"] == "ice":
                ice_msg = IceMessage.model_validate(message)
                await session.send_message(
                    request.name, ice_msg.target, ice_msg.content
                )
            elif message["type"] == "proof":
                proof = ChallengeProofMessage.model_validate(message)
                session.verify_proof(
                    request.name,
                    {
                        name: decode_b64(value)
                        for name, value in proof.player_payloads.items()
                    },
                    nonce,
                )
    except WebSocketDisconnect:
        ...
