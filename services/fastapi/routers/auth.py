"""
Auth router — all endpoints under /api/v1/auth/

Endpoints:
    GET  /auth/google/redirect    → return Google authorization URL to Vue
    POST /auth/google/callback    → exchange code, issue JWT pair
    POST /auth/login              → password login, issue JWT pair
    POST /auth/logout             → revoke refresh token, clear cookie
    POST /auth/refresh            → exchange refresh cookie for new access token
    GET  /auth/me                 → return current user from access token

JWT pattern:
    Access token  → JSON body → Pinia memory (never localStorage)
    Refresh token → httpOnly cookie "refresh_token" (30 days)
    Refresh token hash stored in {tenant}.remember_me_tokens for revocation

Rate limiting via slowapi (10 attempts / 15 min per IP on login).
"""

from datetime import datetime, timezone
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from jose import JWTError
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth.dependencies import CurrentUser, DBConn
from auth.google import build_authorization_url, exchange_code, generate_state, get_userinfo
from auth.jwt import (
    REFRESH_COOKIE_MAX_AGE,
    REFRESH_COOKIE_NAME,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_token,
)
from auth.password import hash_password, verify_password
from config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=REFRESH_COOKIE_MAX_AGE,
        path="/api/v1/auth",  # only sent to auth endpoints — reduces attack surface
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/api/v1/auth",
    )


async def _upsert_user_by_google(
    conn: asyncpg.Connection,
    tenant_slug: str,
    google_sub: str,
    email: str,
    name: str | None,
    picture: str | None,
) -> dict:
    """
    Find or create a tenant user matched by google_sub (primary) or email (fallback).
    Returns a dict with id, email, role, force_password_change.
    """
    # 1. Try google_sub match first
    row = await conn.fetchrow(
        f"""
        SELECT u.id, i.email, ur.role, u.force_password_change
        FROM {tenant_slug}.users u
        JOIN {tenant_slug}.identities i ON i.id = u.identity_id
        LEFT JOIN {tenant_slug}.user_roles ur ON ur.user_id = u.id
        WHERE u.google_sub = $1 AND u.deleted_at IS NULL
        LIMIT 1
        """,
        google_sub,
    )
    if row:
        return dict(row)

    # 2. Try email match — link google_sub to existing account
    row = await conn.fetchrow(
        f"""
        SELECT u.id, i.email, ur.role, u.force_password_change
        FROM {tenant_slug}.users u
        JOIN {tenant_slug}.identities i ON i.id = u.identity_id
        LEFT JOIN {tenant_slug}.user_roles ur ON ur.user_id = u.id
        WHERE i.email = $1 AND u.deleted_at IS NULL
        LIMIT 1
        """,
        email,
    )
    if row:
        await conn.execute(
            f"UPDATE {tenant_slug}.users SET google_sub = $1, updated_at = now() WHERE id = $2",
            google_sub,
            row["id"],
        )
        return dict(row)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No account found for this Google identity. Contact your administrator.",
    )


async def _store_refresh_token(
    conn: asyncpg.Connection,
    tenant_slug: str,
    user_id: str,
    token_hash: str,
) -> None:
    settings = get_settings()
    expires = datetime.now(tz=timezone.utc).replace(tzinfo=None)
    from datetime import timedelta
    expires = datetime.now(tz=timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    await conn.execute(
        f"""
        INSERT INTO {tenant_slug}.remember_me_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (token_hash) DO NOTHING
        """,
        user_id,
        token_hash,
        expires,
    )


async def _revoke_refresh_token(
    conn: asyncpg.Connection,
    tenant_slug: str,
    token_hash: str,
) -> None:
    await conn.execute(
        f"DELETE FROM {tenant_slug}.remember_me_tokens WHERE token_hash = $1",
        token_hash,
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class LoginRequest(BaseModel):
    email: str
    password: str
    tenant_slug: str | None = None  # optional — defaults to DEFAULT_TENANT_SLUG


class GoogleCallbackRequest(BaseModel):
    code: str
    state: str
    tenant_slug: str | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/google/redirect")
async def google_redirect():
    """Return the Google authorization URL. Vue redirects the user there."""
    state = generate_state()
    url = build_authorization_url(state)
    return {"url": url, "state": state}


@router.post("/google/callback", response_model=TokenResponse)
async def google_callback(
    body: GoogleCallbackRequest,
    response: Response,
    conn: DBConn,
):
    """
    Exchange Google authorization code for JWT pair.
    Called by Vue after Google redirects back with ?code=&state=
    """
    settings = get_settings()
    tenant_slug = body.tenant_slug or settings.default_tenant_slug

    try:
        token_data = await exchange_code(body.code)
        userinfo = await get_userinfo(token_data["access_token"])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to authenticate with Google",
        )

    google_sub = userinfo.get("sub", "")
    email = userinfo.get("email", "")
    name = userinfo.get("name")
    picture = userinfo.get("picture")

    user = await _upsert_user_by_google(conn, tenant_slug, google_sub, email, name, picture)

    access_token = create_access_token(
        user_id=str(user["id"]),
        email=user["email"],
        role=user["role"] or "rep",
        tenant_slug=tenant_slug,
    )
    raw_refresh, refresh_hash = create_refresh_token(
        user_id=str(user["id"]),
        email=user["email"],
        role=user["role"] or "rep",
        tenant_slug=tenant_slug,
    )
    await _store_refresh_token(conn, tenant_slug, str(user["id"]), refresh_hash)
    _set_refresh_cookie(response, raw_refresh)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/15minute")
async def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    conn: DBConn,
):
    """Password login. Rate-limited: 10 attempts per 15 min per IP."""
    settings = get_settings()
    tenant_slug = body.tenant_slug or settings.default_tenant_slug

    row = await conn.fetchrow(
        f"""
        SELECT u.id, i.email, u.password_hash, u.force_password_change, ur.role,
               u.status, u.token_version
        FROM {tenant_slug}.users u
        JOIN {tenant_slug}.identities i ON i.id = u.identity_id
        LEFT JOIN {tenant_slug}.user_roles ur ON ur.user_id = u.id
        WHERE i.email = $1 AND u.deleted_at IS NULL
        LIMIT 1
        """,
        body.email.lower().strip(),
    )

    # Constant-time failure to prevent user enumeration
    dummy_hash = "$2b$10$invalid.hash.for.timing.safety.only.xxxxxxxxxxxxxxxxxx"
    stored_hash = row["password_hash"] if row else dummy_hash

    if not verify_password(body.password, stored_hash) or not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if row["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active. Contact your administrator.",
        )

    role = row["role"] or "rep"
    access_token = create_access_token(
        user_id=str(row["id"]),
        email=row["email"],
        role=role,
        tenant_slug=tenant_slug,
    )
    raw_refresh, refresh_hash = create_refresh_token(
        user_id=str(row["id"]),
        email=row["email"],
        role=role,
        tenant_slug=tenant_slug,
    )
    await _store_refresh_token(conn, tenant_slug, str(row["id"]), refresh_hash)
    _set_refresh_cookie(response, raw_refresh)

    result = TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )

    # If password change required, signal it in the response body
    if row["force_password_change"]:
        return JSONResponse(
            status_code=200,
            content={**result.model_dump(), "force_password_change": True},
            headers=dict(response.headers),
        )

    return result


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    response: Response,
    conn: DBConn,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    """
    Exchange a valid refresh token cookie for a new access token.
    Also rotates the refresh token (issues a new one, revokes the old).
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    try:
        payload = decode_token(refresh_token)
    except JWTError:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.type != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token type")

    token_hash = hash_token(refresh_token)
    tenant_slug = payload.tenant

    # Verify token exists in DB (revocation check)
    row = await conn.fetchrow(
        f"""
        SELECT user_id FROM {tenant_slug}.remember_me_tokens
        WHERE token_hash = $1 AND expires_at > now()
        """,
        token_hash,
    )
    if not row:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked or expired",
        )

    # Fetch fresh user data (role may have changed)
    user_row = await conn.fetchrow(
        f"""
        SELECT u.id, i.email, ur.role
        FROM {tenant_slug}.users u
        JOIN {tenant_slug}.identities i ON i.id = u.identity_id
        LEFT JOIN {tenant_slug}.user_roles ur ON ur.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL AND u.status = 'active'
        """,
        row["user_id"],
    )
    if not user_row:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    role = user_row["role"] or "rep"

    # Rotate: revoke old, issue new
    await _revoke_refresh_token(conn, tenant_slug, token_hash)
    new_access = create_access_token(
        user_id=str(user_row["id"]),
        email=user_row["email"],
        role=role,
        tenant_slug=tenant_slug,
    )
    new_raw_refresh, new_hash = create_refresh_token(
        user_id=str(user_row["id"]),
        email=user_row["email"],
        role=role,
        tenant_slug=tenant_slug,
    )
    await _store_refresh_token(conn, tenant_slug, str(user_row["id"]), new_hash)
    _set_refresh_cookie(response, new_raw_refresh)

    settings = get_settings()
    return TokenResponse(
        access_token=new_access,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout")
async def logout(
    response: Response,
    conn: DBConn,
    current_user: CurrentUser,
    refresh_token_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    """Revoke refresh token in DB, clear cookie. Access token expires naturally (≤15 min)."""
    if refresh_token_cookie:
        token_hash = hash_token(refresh_token_cookie)
        await _revoke_refresh_token(conn, current_user.tenant, token_hash)
    _clear_refresh_cookie(response)
    return {"ok": True}


@router.get("/me")
async def me(current_user: CurrentUser):
    """Return current user from access token claims. No DB hit — fully stateless."""
    return {
        "id":     current_user.sub,
        "email":  current_user.email,
        "role":   current_user.role,
        "tenant": current_user.tenant,
    }
