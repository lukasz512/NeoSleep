"""
Google OIDC helper — pure functions, no FastAPI coupling.

Flow:
    1. GET /api/v1/auth/google/redirect
       → build authorization URL with state param, return to Vue
    2. Vue redirects user to Google
    3. Google redirects back to GOOGLE_CALLBACK_URL (Vue route)
    4. Vue extracts ?code=&state= and POSTs to POST /api/v1/auth/google/callback
    5. We exchange code → tokens → userinfo → upsert user → issue JWT pair
"""

import secrets
import httpx
from config import get_settings


GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO  = "https://openidconnect.googleapis.com/v1/userinfo"


def build_authorization_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id":     settings.google_client_id,
        "redirect_uri":  settings.google_callback_url,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "online",
        "state":         state,
        "prompt":        "select_account",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query}"


def generate_state() -> str:
    return secrets.token_urlsafe(32)


async def exchange_code(code: str) -> dict:
    """Exchange authorization code for Google tokens. Returns token response dict."""
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri":  settings.google_callback_url,
                "grant_type":    "authorization_code",
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


async def get_userinfo(access_token: str) -> dict:
    """Fetch user profile from Google using the access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
