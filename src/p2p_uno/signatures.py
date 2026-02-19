import hashlib
import json
from typing import Any, Literal

import ecdsa
import pydantic
from ecdsa.keys import SigningKey

from p2p_uno import util


class Verifier:
    def __init__(self, public_key: bytes) -> None:
        self.key = ecdsa.VerifyingKey.from_string(
            public_key,
            curve=ecdsa.NIST256p,
            hashfunc=hashlib.sha256,
        )

    def verify(self, signature: bytes, payload: bytes) -> bool:
        try:
            self.key.verify(
                signature,
                payload,
                hashfunc=hashlib.sha256,
            )
            return True
        except ecdsa.BadSignatureError:
            return False


class SessionStartMessage(pydantic.BaseModel):
    session_handle: str
    signature: str
    type: Literal["lobbyend"] = "lobbyend"


class HandleSigner:
    def __init__(self, key: ecdsa.SigningKey) -> None:
        self.key = key

    @classmethod
    def generate(cls):
        key = ecdsa.SigningKey.generate(curve=ecdsa.NIST521p)
        return cls(key)

    @classmethod
    def from_b64(cls, b64: str):
        key = SigningKey.from_string(util.decode_b64(b64))
        return cls(key)

    def sign_handle(self, payload: dict[str, Any]) -> SessionStartMessage:
        serialized = json.dumps(payload)
        signature = self.key.sign(serialized.encode())
        return SessionStartMessage(
            session_handle=serialized,
            signature=util.encode_b64(signature),
        )

    def export_b64(self) -> tuple[str, str]:
        assert isinstance(self.key.verifying_key, ecdsa.VerifyingKey)
        return (
            util.encode_b64(self.key.to_string()),
            util.encode_b64(self.key.verifying_key.to_string()),
        )

    def export_file(self, path: str, pub_path: str | None):
        with open(path, "wb") as f:
            f.write(self.key.to_string())
        if pub_path is not None:
            assert isinstance(self.key.verifying_key, ecdsa.VerifyingKey)
            with open(pub_path, "wb") as f:
                f.write(self.key.verifying_key.to_string())

    @classmethod
    def load_file(cls, path: str):
        with open(path, "rb") as f:
            key = ecdsa.SigningKey.from_string(f.read(), curve=ecdsa.NIST521p)
        return cls(key)
