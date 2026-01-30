import base64
import logging


def setup_logging():
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def decode_b64(b64: str) -> bytes:
    return base64.b64decode(b64)


def encode_b64(data: bytes) -> str:
    return base64.b64encode(data).decode()
