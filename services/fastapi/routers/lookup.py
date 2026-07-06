"""
Lookup router — global reference data from platform.lookups
GET /api/v1/lookup?type=specialty&locale=pl
GET /api/v1/lookup/types
"""

from typing import Any
from fastapi import APIRouter, Query
from auth.dependencies import CurrentUser, DBConn

router = APIRouter(prefix="/lookup", tags=["lookup"])


@router.get("")
async def get_lookups(
    current_user: CurrentUser,
    conn: DBConn,
    type: str | None = Query(default=None),
    locale: str = Query(default="en"),
) -> list[dict[str, Any]]:
    """
    Return lookup values. Falls back to 'en' if the requested locale has no row for a key.
    """
    if type:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (l.key)
                l.id, l.type, l.key, l.value, l.sort_order, l.locked
            FROM platform.lookups l
            WHERE l.type = $1
              AND l.locale IN ($2, 'en')
            ORDER BY l.key, (l.locale = $2) DESC, l.sort_order
            """,
            type,
            locale,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (l.type, l.key)
                l.id, l.type, l.key, l.value, l.sort_order, l.locked
            FROM platform.lookups l
            WHERE l.locale IN ($1, 'en')
            ORDER BY l.type, l.key, (l.locale = $1) DESC, l.sort_order
            """,
            locale,
        )
    return [dict(r) for r in rows]


@router.get("/types")
async def get_lookup_types(
    current_user: CurrentUser,
    conn: DBConn,
) -> list[str]:
    rows = await conn.fetch("SELECT DISTINCT type FROM platform.lookups ORDER BY type")
    return [r["type"] for r in rows]
