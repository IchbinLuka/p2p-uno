from __future__ import annotations

import base64
import hashlib
import hmac
import itertools
import time

import pydantic


class IceServer(pydantic.BaseModel):
    urls: str | list[str]
    credential: str | None = None
    username: str | None = None


class TurnEndpoint(pydantic.BaseModel):
    port: int
    transport: str
    secure: bool


class TurnConfig(pydantic.BaseModel):
    secret: str
    host: str
    ttl: int = 60 * 5  # 5 minutes
    endpoints: list[TurnEndpoint] = pydantic.Field(
        default_factory=lambda: [
            # Default TURN endpoints in coturn
            TurnEndpoint(port=3478, transport="tcp", secure=False),
            TurnEndpoint(port=3478, transport="udp", secure=False),
            TurnEndpoint(port=5349, transport="tcp", secure=True),
        ]
    )

    def get_ice_servers(self, player_name: str) -> list[IceServer]:
        """Get the TURN servers as RTCIceServers."""
        timestamp = int(time.time()) + self.ttl
        username = f"{timestamp}:{player_name}"
        dig = hmac.new(self.secret.encode(), username.encode(), hashlib.sha1).digest()
        password = base64.b64encode(dig).decode()
        return [
            IceServer(
                urls=[
                    f"{'turns' if endpoint.secure else 'turn'}:{self.host}:{endpoint.port}?transport={endpoint.transport}"
                    for endpoint in self.endpoints
                ],
                username=username,
                credential=password,
            )
        ]


class IceServerProvider:
    DEFAULT_ICE_SERVERS = [
        IceServer(urls="stun:stun1.l.google.com:19302"),
        IceServer(urls="stun:stun2.l.google.com:19302"),
    ]

    def __init__(self, turn_configs: dict[str, TurnConfig] | None):
        self.turn_configs = turn_configs

    def get_ice_servers(self, player_name: str) -> list[IceServer]:
        """Get the TURN servers as RTCIceServers."""
        if self.turn_configs is None:
            return self.DEFAULT_ICE_SERVERS
        return list(
            itertools.chain(
                self.DEFAULT_ICE_SERVERS,
                *[
                    turn_config.get_ice_servers(player_name)
                    for turn_config in self.turn_configs.values()
                ],
            )
        )
