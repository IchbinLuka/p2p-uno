from p2p_uno.signatures import Verifier


def test_verify_signature():
    SIGNATURE = "19cb97426426b355d2e254cd7d167edcbf00cfcdd1751962e53f3dee7cc23c24cc421fe0c720cf4f8483ba40f4cab2c08a81c4ce53df4c715b910e7039da9180"
    PUBLIC_KEY = "04298d31575244fc7e55fc5b4e6f2c3925d240af06e9ebbf188b3931ef1df6e825fd1e0abefc789a4bfba711e72aa452b9d97d9dec4bbb7086c5858216c1dd75fc"
    NONCE = "871e326ffda39118a5330f7df45d868a4cab361f02fff52bcba23fd95552767c"

    print(len(PUBLIC_KEY) / 2)
    verifier = Verifier(bytes.fromhex(PUBLIC_KEY))
    assert verifier.verify(bytes.fromhex(SIGNATURE), bytes.fromhex(NONCE))

    # public_key = decode_b64(PUBLIC_KEY)
    # key = ecdsa.VerifyingKey.from_string(public_key, curve=ecdsa.NIST256p)

    # key.verify(decode_b64(PROOF), decode_b64(NONCE))
