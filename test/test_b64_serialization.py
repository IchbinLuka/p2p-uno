import secrets

from p2p_uno.util import decode_b64, encode_b64

key_hex = "04459be98a4ff64672a8b0f41017e2fcf64fcb31040cf37a1d66c070fd8049d0736da1f921cf27ec88227ad75945d8ded371d18f3fd4b7b24887211b103a3e5773"
key_b64 = "BEWb6YpP9kZyqLD0EBfi/PZPyzEEDPN6HWbAcP2ASdBzbaH5Ic8n7IgietdZRdje03HRjz/Ut7JIhyEbEDo+V3M="


def test_buffer_encode_decode():
    nonce = secrets.token_bytes(32)
    serialized = encode_b64(nonce)
    assert decode_b64(serialized) == nonce


def test_public_key_deserialization():
    assert bytes.fromhex(key_hex) == decode_b64(key_b64)
