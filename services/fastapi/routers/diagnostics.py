"""
Diagnostics router — frontend error logging.
POST /api/v1/diagnostics — no auth required (frontend may not be logged in when erroring).
"""

import hashlib
from fastapi import APIRouter, Request
from pydantic import BaseModel
from database import get_pool

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


class DiagnosticPayload(BaseModel):
    level: str = "error"
    message: str
    stack: str | None = None
    source: str = "frontend"
    metadata: dict | None = None


@router.post("", status_code=204)
async def log_diagnostic(body: DiagnosticPayload, request: Request):
    msg = body.message[:2000]
    msg_hash = hashlib.sha256(msg.encode()).hexdigest()
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO platform.diagnostics
                    (level, message, message_hash, stack, source, metadata)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (message_hash) DO UPDATE
                    SET count = platform.diagnostics.count + 1,
                        last_seen = now()
                """,
                body.level,
                msg,
                msg_hash,
                body.stack[:5000] if body.stack else None,
                body.source,
                str(body.metadata) if body.metadata else None,
            )
    except Exception:
        pass  # Never fail on diagnostic writes
