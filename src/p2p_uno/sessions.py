import asyncio
import itertools
import json
import logging
import random
import secrets
import uuid
from dataclasses import dataclass
from typing import Any, Callable

import ecdsa
import pydantic
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from typing_extensions import Coroutine

from p2p_uno.signatures import HandleSigner, Verifier
from p2p_uno.turn import IceServer, IceServerProvider
from p2p_uno.util import decode_b64, encode_b64

logger = logging.getLogger(__name__)


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


class SessionFull(RuntimeError):
    def __init__(self, name: str) -> None:
        super().__init__(f"Session {name} is full")


class Session:
    def __init__(self, session_id: str, name: str, max_players: int) -> None:
        self.players: dict[str, Player] = {}
        self.session_id = session_id
        self.name = name
        self.max_players = max_players
        self.started: bool = False

    def add_player(self, player: Player):
        if player.name in self.players:
            print(self.players)
            raise PlayerAlreadyExists(player.name)
        if len(self.players) >= self.max_players:
            raise SessionFull(self.name)
        self.players[player.name] = player

    def remove_player(self, name: str):
        if name not in self.players:
            raise PlayerNotFound(name)
        logger.debug(f"Removing player {name} from session {self.name}")
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

    async def start(self, handle_signer: HandleSigner):
        handle = {
            "verified_players": [
                {"name": player.name, "key": encode_b64(player.public_key)}
                for player in self.players.values()
                if player.accepted
            ],
            "top_card": {
                "color": random.choice(["red", "green", "blue", "yellow"]),
                "number": random.randint(0, 9),
            },
        }
        end_message = handle_signer.sign_handle(handle).model_dump_json()
        self.started = True
        await asyncio.gather(
            *[
                player.websocket.send_text(end_message)
                for player in self.players.values()
            ]
        )


SESSIONS: dict[str, Session] = {}


class SessionRepr(pydantic.BaseModel):
    session_id: str
    session_name: str
    player_count: int
    max_players: int


class SessionCreate(pydantic.BaseModel):
    session_name: str
    max_players: int


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


def create_app(signer: HandleSigner, ice_servers: IceServerProvider):
    app = FastAPI()

    @app.post("/")
    async def create_session(body: SessionCreate):
        session_id = uuid.uuid4()
        session = Session(
            session_id=str(session_id),
            name=body.session_name,
            max_players=body.max_players,
        )
        SESSIONS[str(session_id)] = session
        logger.debug(f"Created session {session_id}")
        return SessionRepr(
            session_id=str(session_id),
            session_name=body.session_name,
            player_count=0,
            max_players=body.max_players,
        )

    @app.get("/")
    async def get_sessions(skip: int, limit: int) -> list[SessionRepr]:
        limit = min(limit, 100)
        return [
            SessionRepr(
                session_id=session_id,
                session_name=session.name,
                player_count=len(session.players),
                max_players=session.max_players,
            )
            for session_id, session in itertools.islice(
                SESSIONS.items(), skip, skip + limit
            )
            if session.player_count() < session.max_players and not session.started
        ]

    @app.get("/{session_id}/available")
    async def name_available(name: str, session_id: str):
        session = SESSIONS.get(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"available": name.strip() in session.players}

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
            name=request.name.strip(),
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
        assert IceServerProvider.instance is not None, (
            "ICE server provider is not initialized"
        )
        await websocket.send_json(
            SessionInfoMessage(
                player_keys={
                    player.name: encode_b64(player.public_key)
                    for player in session.get_players()
                    if player.name != request.name
                },
                challenge_nonce=challenge_nonce,
                ice_servers=ice_servers.get_ice_servers(player.name),
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
                elif message["type"] == "start":
                    await session.start(signer)
        except WebSocketDisconnect:
            session.remove_player(player.name)
            if session.player_count() == 0:
                SESSIONS.pop(session.session_id)

    return app
