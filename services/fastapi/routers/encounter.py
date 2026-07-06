"""
Encounter router — visit log CRUD under /api/v1/encounter
"""

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from auth.dependencies import CurrentUser, DBConn
from database import tenant_conn

router = APIRouter(prefix="/encounter", tags=["encounter"])


class EncounterCreate(BaseModel):
    practitioner_id: UUID
    type: str = "visit"
    start_at: str                     # ISO 8601
    end_at: str | None = None
    location: str | None = None
    checkin_location: dict | None = None
    notes: str | None = None
    next_visit_notes: str | None = None
    objectives: list[str] | None = None
    outcomes: str | None = None
    voice_note_url: str | None = None
    transfer_of_value: float | None = None
    transfer_of_value_currency: str | None = None


class EncounterUpdate(BaseModel):
    type: str | None = None
    notes: str | None = None
    next_visit_notes: str | None = None
    objectives: list[str] | None = None
    outcomes: str | None = None
    voice_note_url: str | None = None
    transfer_of_value: float | None = None


@router.get("")
async def list_encounters(
    current_user: CurrentUser,
    conn: DBConn,
    practitioner_id: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
) -> dict[str, Any]:
    slug = current_user.tenant
    offset = (page - 1) * limit

    conditions = ["e.deleted_at IS NULL"]
    params: list[Any] = []
    idx = 1

    # Reps see only their own encounters; admins/managers see all
    if current_user.role == "rep":
        conditions.append(f"e.user_id = ${idx}")
        params.append(current_user.sub)
        idx += 1

    if practitioner_id:
        conditions.append(f"e.practitioner_id = ${idx}")
        params.append(practitioner_id)
        idx += 1

    where = "WHERE " + " AND ".join(conditions)

    async with tenant_conn(conn, slug) as tc:
        total = await tc.fetchval(
            f"SELECT COUNT(*) FROM encounter e {where}", *params
        )
        rows = await tc.fetch(
            f"""
            SELECT
                e.id, e.practitioner_id, e.user_id, e.type,
                e.start_at, e.end_at, e.location,
                e.notes, e.next_visit_notes, e.outcomes,
                e.transfer_of_value, e.transfer_of_value_currency,
                e.voice_note_url, e.checkin_location,
                e.created_at, e.updated_at,
                i.first_name, i.last_name
            FROM encounter e
            JOIN practitioner p ON p.id = e.practitioner_id
            JOIN identities i ON i.id = p.identity_id
            {where}
            ORDER BY e.start_at DESC
            LIMIT ${idx} OFFSET ${idx + 1}
            """,
            *params,
            limit,
            offset,
        )

    return {
        "data": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_encounter(
    body: EncounterCreate,
    current_user: CurrentUser,
    conn: DBConn,
) -> dict[str, Any]:
    slug = current_user.tenant
    async with tenant_conn(conn, slug) as tc:
        async with tc.transaction():
            encounter_id = await tc.fetchval(
                """
                INSERT INTO encounter
                    (practitioner_id, user_id, type, start_at, end_at, location,
                     checkin_location, notes, next_visit_notes, objectives,
                     outcomes, voice_note_url, transfer_of_value,
                     transfer_of_value_currency)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                RETURNING id
                """,
                body.practitioner_id,
                current_user.sub,
                body.type,
                body.start_at,
                body.end_at,
                body.location,
                json.dumps(body.checkin_location) if body.checkin_location else None,
                body.notes,
                body.next_visit_notes,
                json.dumps(body.objectives) if body.objectives else None,
                body.outcomes,
                body.voice_note_url,
                body.transfer_of_value,
                body.transfer_of_value_currency,
            )

            # Update practitioner's last_visit_at
            await tc.execute(
                "UPDATE practitioner SET last_visit_at = now() WHERE id = $1",
                body.practitioner_id,
            )

            await tc.execute(
                """
                INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after)
                VALUES ($1, 'encounter.create', 'encounter', $2, $3)
                """,
                current_user.sub,
                str(encounter_id),
                json.dumps({"practitioner_id": str(body.practitioner_id), "type": body.type}),
            )

    return {"id": str(encounter_id)}


@router.patch("/{encounter_id}")
async def update_encounter(
    encounter_id: UUID,
    body: EncounterUpdate,
    current_user: CurrentUser,
    conn: DBConn,
) -> dict[str, Any]:
    slug = current_user.tenant
    async with tenant_conn(conn, slug) as tc:
        row = await tc.fetchrow(
            "SELECT id, user_id FROM encounter WHERE id = $1 AND deleted_at IS NULL",
            encounter_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Encounter not found")

        # Reps can only edit their own encounters
        if current_user.role == "rep" and str(row["user_id"]) != current_user.sub:
            raise HTTPException(status_code=403, detail="Cannot edit another rep's encounter")

        fields = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if not fields:
            return {"id": str(encounter_id)}

        sets = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
        await tc.execute(
            f"UPDATE encounter SET {sets}, updated_at = now() WHERE id = $1",
            encounter_id,
            *fields.values(),
        )
        await tc.execute(
            """
            INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after)
            VALUES ($1, 'encounter.update', 'encounter', $2, $3)
            """,
            current_user.sub,
            str(encounter_id),
            json.dumps(fields),
        )

    return {"id": str(encounter_id)}
