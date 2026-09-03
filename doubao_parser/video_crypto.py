import base64
import binascii
import hashlib
from urllib.parse import urlsplit

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

QAAB_SALT = bytes.fromhex(
    "4dd4c2e6b83162090e52b3c7a6733ba4"
    "1cb2462b829ab58a196b39db57177524"
    "f49baf7f08e8d68d26a72e37c1a95a2f"
    "1f05a51892aef2949732b62a38aadd58"
)


def _is_http_url(value: str) -> bool:
    parsed = urlsplit(value)
    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.netloc)


def _decode_base64_loose(value: str) -> bytes | None:
    text = str(value or "").strip()
    variants = (
        text,
        text.translate(str.maketrans({"$": "_", "@": "/", "#": "."})),
        text.translate(str.maketrans({"$": "+", "@": "/", "#": "="})),
    )

    seen: set[str] = set()
    for candidate in variants:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        normalized = candidate.replace("-", "+").replace("_", "/")
        normalized += "=" * (-len(normalized) % 4)
        try:
            return base64.b64decode(normalized, validate=True)
        except (binascii.Error, ValueError):
            continue
    return None


def _url_from_bytes(value: bytes) -> str:
    if not value or any(byte not in (9, 10, 13) and not 32 <= byte <= 126 for byte in value):
        return ""
    try:
        url = value.decode("ascii").strip()
    except UnicodeDecodeError:
        return ""
    return url if _is_http_url(url) else ""


def _strip_pkcs7(value: bytes) -> bytes:
    if not value:
        return b""
    padding = value[-1]
    if padding < 1 or padding > 16 or padding > len(value):
        return value
    if value[-padding:] != bytes([padding]) * padding:
        return value
    return value[:-padding]


def _decrypt_aes_cbc_url(payload: bytes, key: bytes, iv: bytes) -> str:
    if not payload or len(payload) % 16:
        return ""
    try:
        decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
        plaintext = decryptor.update(payload) + decryptor.finalize()
    except ValueError:
        return ""

    return _url_from_bytes(plaintext) or _url_from_bytes(_strip_pkcs7(plaintext))


def decode_qaab_token(token: str, key_seed: str) -> str:
    """Decode a Doubao qAAB media URL token using its response key_seed."""
    data = _decode_base64_loose(token)
    seed = _decode_base64_loose(key_seed)
    if not data or not seed:
        return ""

    first_digest = hashlib.sha512(seed[:32]).digest()
    material = hashlib.sha512(first_digest + QAAB_SALT).digest()
    key, iv = material[:16], material[16:32]

    attempts: list[tuple[bytes, bytes, bytes]] = []
    if data.startswith(b"\xa8\x00\x01\x00"):
        attempts.extend(((data[4:], key, iv), (data[4:], iv, key)))
        if len(data) > 36:
            attempts.extend(((data[36:], key, data[20:36]), (data[36:], key, iv)))
    else:
        attempts.append((data, key, iv))

    for payload, attempt_key, attempt_iv in attempts:
        url = _decrypt_aes_cbc_url(payload, attempt_key, attempt_iv)
        if url:
            return url
    return ""


def decode_main_url(token: str, key_seed: str = "") -> str:
    """Decode plain, Base64-wrapped, or qAAB-encrypted media URLs."""
    token = str(token or "").strip()
    if _is_http_url(token):
        return token

    decoded = _decode_base64_loose(token)
    plain_url = _url_from_bytes(decoded or b"")
    if plain_url:
        return plain_url

    if token.startswith("qAAB") and key_seed:
        return decode_qaab_token(token, key_seed)
    return ""
