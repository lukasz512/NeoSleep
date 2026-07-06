from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Server ────────────────────────────────────────────────────────────────
    env: str = "development"
    port: int = 8000

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str

    # ── JWT ───────────────────────────────────────────────────────────────────
    # Access token: short-lived, stored in Vue memory only (never localStorage).
    # Refresh token: long-lived, httpOnly cookie — stored hash in remember_me_tokens table.
    jwt_secret: str                           # openssl rand -hex 64
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # ── Google OIDC ───────────────────────────────────────────────────────────
    google_client_id: str = ""
    google_client_secret: str = ""
    google_callback_url: str = "http://localhost:5173/auth/google/callback"

    # ── CORS ──────────────────────────────────────────────────────────────────
    frontend_url: str = "http://localhost:5173"

    # ── Multi-tenancy ─────────────────────────────────────────────────────────
    default_tenant_slug: str = "neosleep"

    # ── Admin seed ────────────────────────────────────────────────────────────
    admin_default_password: str = "change-me-in-production"

    # ── Email (fastapi-mail via Gmail SMTP) ───────────────────────────────────
    gmail_user: str = ""
    gmail_app_password: str = ""
    mail_from_name: str = "NeoSleep"

    # ── VAPID (Web Push) ──────────────────────────────────────────────────────
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@neosleepcare.com"

    # ── Observability ─────────────────────────────────────────────────────────
    enable_diagnostics_db: bool = False

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def cookie_secure(self) -> bool:
        return self.is_production

    @property
    def cookie_samesite(self) -> str:
        # "lax" works for same-site redirects (Google OIDC callback).
        # "strict" breaks OAuth redirects. "none" requires Secure=True.
        return "lax"


@lru_cache
def get_settings() -> Settings:
    return Settings()
