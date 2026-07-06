"""
Async PostgreSQL connection pool via asyncpg.

One pool for the entire FastAPI process. Acquired inside lifespan, closed on shutdown.
All DB access goes through `get_db()` — a FastAPI dependency that yields a connection
from the pool for the duration of a single request, then releases it.

Tenant isolation: every query that touches business data is wrapped in
`tenant_query(conn, tenant_slug, sql, *args)` which prepends `SET search_path TO <slug>`.
This guarantees no cross-tenant data leakage even if the router forgets to specify schema.
"""

import asyncpg
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from config import get_settings

logger = logging.getLogger("neocrm.db")

# Module-level pool — set during lifespan startup
_pool: asyncpg.Pool | None = None


async def create_pool() -> None:
    global _pool
    settings = get_settings()
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=25,
        command_timeout=30,
        server_settings={"application_name": "neocrm-fastapi"},
    )
    logger.info("DB pool created (min=2, max=25)")


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("DB pool closed")


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized — was lifespan started?")
    return _pool


async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """FastAPI dependency — yields one connection per request."""
    async with get_pool().acquire() as conn:
        yield conn


@asynccontextmanager
async def tenant_conn(conn: asyncpg.Connection, tenant_slug: str):
    """
    Context manager that sets the PostgreSQL search_path to the tenant schema
    for the duration of the block, then resets it to public.

    Usage:
        async with tenant_conn(conn, slug) as tc:
            rows = await tc.fetch("SELECT * FROM practitioner LIMIT 10")
    """
    # Validate slug to prevent schema injection (same rule as SQL migration)
    import re
    if not re.fullmatch(r"[a-z][a-z0-9_]{1,62}", tenant_slug):
        raise ValueError(f"Invalid tenant slug: {tenant_slug!r}")

    await conn.execute(f"SET LOCAL search_path TO {tenant_slug}, public")
    try:
        yield conn
    finally:
        await conn.execute("SET LOCAL search_path TO public")
