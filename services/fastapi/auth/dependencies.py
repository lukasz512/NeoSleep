"""
FastAPI dependencies for authentication and tenant resolution.

Usage in routers:
    @router.get("/practitioner")
    async def list_practitioners(
        current_user: CurrentUser,         # requires valid access token
        conn: DBConn,                      # pooled DB connection
    ):
        ...

Dependency chain:
    Bearer header → decode_token() → TokenPayload
                 ↓
           CurrentUser (Annotated alias)
"""

from typing import Annotated
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

import asyncpg

from auth.jwt import decode_token, TokenPayload
from database import get_db

_bearer = HTTPBearer(auto_error=False)


def _get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> TokenPayload:
    """
    Extract and validate Bearer access token from Authorization header.
    Returns the decoded TokenPayload on success.
    Raises 401 on missing / invalid / expired token.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected access token",
        )
    return payload


def _require_admin(user: TokenPayload = Depends(_get_current_user)) -> TokenPayload:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def _require_manager_or_above(user: TokenPayload = Depends(_get_current_user)) -> TokenPayload:
    if user.role not in ("admin", "manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager access required")
    return user


# ── Annotated type aliases — import these in routers ─────────────────────────
CurrentUser = Annotated[TokenPayload, Depends(_get_current_user)]
AdminUser   = Annotated[TokenPayload, Depends(_require_admin)]
ManagerUser = Annotated[TokenPayload, Depends(_require_manager_or_above)]
DBConn      = Annotated[asyncpg.Connection, Depends(get_db)]
