"""
JWT utilities — access token + refresh token.

Access token  (15 min)   → returned in JSON body → stored in Pinia memory only
Refresh token (30 days)  → stored as httpOnly cookie "refresh_token"
                         → hash stored in {tenant}.remember_me_tokens table

Token payload (claims):
    sub          str   user UUID from {tenant}.users
    email        str
    role         str   admin | manager | rep
    tenant       str   tenant slug (e.g. "neosleep")
    type         str   "access" | "refresh"
    exp          int   Unix timestamp
    iat          int   issued-at

Security notes:
- Access tokens are NOT stored anywhere server-side (stateless).
- The 15-minute window after logout is an accepted industry trade-off.
- Refresh tokens ARE stored (hashed SHA-256) in DB, so they can be revoked on logout.
- We sign with HS256 + 64-byte secret. RS256 would require key infrastructure we don't need yet.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from pydantic import BaseModel

from config import get_settings


class TokenPayload(BaseModel):
    sub: str          # user UUID
    email: str
    role: str
    tenant: str
    type: str         # "access" | "refresh"
    exp: int
    iat: int


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def create_access_token(
    user_id: str,
    email: str,
    role: str,
    tenant_slug: str,
) -> str:
    settings = get_settings()
    expire = _now() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "tenant": tenant_slug,
        "type": "access",
        "iat": int(_now().timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    user_id: str,
    email: str,
    role: str,
    tenant_slug: str,
) -> tuple[str, str]:
    """
    Returns (raw_token, token_hash).
    - raw_token  → sent to client as httpOnly cookie
    - token_hash → stored in DB (SHA-256 of raw_token)
    """
    settings = get_settings()
    expire = _now() + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "tenant": tenant_slug,
        "type": "refresh",
        "iat": int(_now().timestamp()),
        "exp": int(expire.timestamp()),
        # Extra entropy so even identical users get unique tokens
        "jti": secrets.token_hex(16),
    }
    raw = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash


def decode_token(token: str) -> TokenPayload:
    """Decode and validate a JWT. Raises JWTError on failure."""
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )
    return TokenPayload(**payload)


def hash_token(raw: str) -> str:
    """SHA-256 hash of a raw token — used for DB lookups."""
    return hashlib.sha256(raw.encode()).hexdigest()


REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = get_settings().refresh_token_expire_days * 24 * 60 * 60  # seconds
