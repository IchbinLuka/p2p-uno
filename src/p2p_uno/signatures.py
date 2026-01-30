import hashlib

import ecdsa


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
