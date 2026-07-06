"""
Practitioner router — HCP CRUD under /api/v1/practitioner
Mirrors the Express practitioner router, ported to FastAPI + asyncpg.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from auth.dependencies import CurrentUser, DBConn
from database import tenant_conn

router = APIRouter(prefix="/practitioner", tags=["practitioner"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PractitionerCreate(BaseModel):
    first_name: str
    last_name: str
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    primary_specialty: str | None = None
    institution: str | None = None
    region: str | None = None
    country_code: str | None = None
    influence_tier: str | None = None
    language: str | None = "en"
    national_ids: dict[str, str] | None = None


class PractitionerUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    primary_specialty: str | None = None
    institution: str | None = None
    region: str | None = None
    country_code: str | None = None
    influence_tier: str | None = None
    language: str | None = None
    national_ids: dict[str, str] | None = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_practitioners(
    current_user: CurrentUser,
    conn: DBConn,
    search: str | None = Query(default=None),
    specialty: list[str] = Query(default=[]),
    region: list[str] = Query(default=[]),
    institution: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=200),
    sort_by: str = Query(default="last_name"),
    sort_order: str = Query(default="asc"),
) -> dict[str, Any]:
    slug = current_user.tenant
    offset = (page - 1) * limit

    allowed_sort = {"last_name", "first_name", "primary_specialty", "created_at", "influence_tier"}
    if sort_by not in allowed_sort:
        sort_by = "last_name"
    sort_dir = "DESC" if sort_order.lower() == "desc" else "ASC"

    conditions = ["p.deleted_at IS NULL"]
    params: list[Any] = []
    idx = 1

    if search:
        conditions.append(
            f"(i.first_name ILIKE ${idx} OR i.last_name ILIKE ${idx} "
            f"OR i.email ILIKE ${idx} OR p.institution ILIKE ${idx})"
        )
        params.append(f"%{search}%")
        idx += 1

    if specialty:
        conditions.append(f"p.primary_specialty = ANY(${idx}::text[])")
        params.append(specialty)
        idx += 1

    if region:
        conditions.append(f"p.region = ANY(${idx}::text[])")
        params.append(region)
        idx += 1

    if institution:
        conditions.append(f"p.institution ILIKE ${idx}")
        params.append(f"%{institution}%")
        idx += 1

    where = "WHERE " + " AND ".join(conditions)

    async with tenant_conn(conn, slug) as tc:
        total = await tc.fetchval(
            f"""
            SELECT COUNT(*) FROM practitioner p
            JOIN identities i ON i.id = p.identity_id
            {where}
            """,
            *params,
        )
        rows = await tc.fetch(
            f"""
            SELECT
                p.id, p.identity_id, i.first_name, i.last_name, i.title,
                i.email, i.phone, i.social_links,
                p.primary_specialty, p.specialties, p.institution,
                p.region, p.country_code, p.influence_tier,
                p.engagement_level, p.visit_frequency_target,
                p.national_ids, p.tags, p.notes,
                p.created_at, p.updated_at
            FROM practitioner p
            JOIN identities i ON i.id = p.identity_id
            {where}
            ORDER BY i.{sort_by} {sort_dir}
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
        "pages": max(1, -(-total // limit)),  # ceiling division
    }


@router.get("/{practitioner_id}")
async def get_practitioner(
    practitioner_id: UUID,
    current_user: CurrentUser,
    conn: DBConn,
) -> dict[str, Any]:
    slug = current_user.tenant
    async with tenant_conn(conn, slug) as tc:
        row = await tc.fetchrow(
            """
            SELECT
                p.id, p.identity_id, i.first_name, i.last_name, i.title,
                i.email, i.phone, i.social_links, i.preferred_name,
                p.primary_specialty, p.specialties, p.institution,
                p.region, p.country_code, p.influence_tier,
                p.engagement_level, p.visit_frequency_target,
                p.national_ids, p.tags, p.notes,
                p.next_visit_notes, p.last_visit_at,
                p.created_at, p.updated_at
            FROM practitioner p
            JOIN identities i ON i.id = p.identity_id
            WHERE p.id = $1 AND p.deleted_at IS NULL
            """,
            practitioner_id,
        )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Practitioner not found")
    return dict(row)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_practitioner(
    body: PractitionerCreate,
    current_user: CurrentUser,
    conn: DBConn,
) -> dict[str, Any]:
    slug = current_user.tenant
    import json

    async with tenant_conn(conn, slug) as tc:
        async with tc.transaction():
            identity_id = await tc.fetchval(
                """
                INSERT INTO identities (first_name, last_name, title, email, phone, language)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
                """,
                body.first_name.strip(),
                body.last_name.strip(),
                body.title,
                body.email.strip().lower() if body.email else None,
                body.phone.strip() if body.phone else None,
                body.language or "en",
            )
            practitioner_id = await tc.fetchval(
                """
                INSERT INTO practitioner
                    (identity_id, primary_specialty, institution, region,
                     country_code, influence_tier, national_ids)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
                """,
                identity_id,
                body.primary_specialty,
                body.institution,
                body.region,
                body.country_code,
                body.influence_tier,
                json.dumps(body.national_ids) if body.national_ids else None,
            )
            # Audit log
            await tc.execute(
                """
                INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after)
                VALUES ($1, 'practitioner.create', 'practitioner', $2, $3)
                """,
                current_user.sub,
                str(practitioner_id),
                json.dumps({"first_name": body.first_name, "last_name": body.last_name}),
            )

    return {"id": str(practitioner_id), "identity_id": str(identity_id)}


@router.patch("/{practitioner_id}")
async def update_practitioner(
    practitioner_id: UUID,
    body: PractitionerUpdate,
    current_user: CurrentUser,
    conn: DBConn,
) -> dict[str, Any]:
    slug = current_user.tenant
    import json

    async with tenant_conn(conn, slug) as tc:
        # Verify exists
        row = await tc.fetchrow(
            "SELECT id, identity_id FROM practitioner WHERE id = $1 AND deleted_at IS NULL",
            practitioner_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Practitioner not found")

        identity_id = row["identity_id"]

        # Update identity fields
        identity_fields = {k: v for k, v in {
            "first_name": body.first_name,
            "last_name":  body.last_name,
            "title":      body.title,
            "email":      body.email.strip().lower() if body.email else None,
            "phone":      body.phone,
            "language":   body.language,
        }.items() if v is not None}

        if identity_fields:
            sets = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(identity_fields))
            await tc.execute(
                f"UPDATE identities SET {sets}, updated_at = now() WHERE id = $1",
                identity_id,
                *identity_fields.values(),
            )

        # Update practitioner fields
        prac_fields = {k: v for k, v in {
            "primary_specialty": body.primary_specialty,
            "institution":       body.institution,
            "region":            body.region,
            "country_code":      body.country_code,
            "influence_tier":    body.influence_tier,
            "national_ids":      json.dumps(body.national_ids) if body.national_ids is not None else None,
        }.items() if v is not None}

        if prac_fields:
            sets = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(prac_fields))
            await tc.execute(
                f"UPDATE practitioner SET {sets}, updated_at = now() WHERE id = $1",
                practitioner_id,
                *prac_fields.values(),
            )

        await tc.execute(
            """
            INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after)
            VALUES ($1, 'practitioner.update', 'practitioner', $2, $3)
            """,
            current_user.sub,
            str(practitioner_id),
            json.dumps(body.model_dump(exclude_none=True)),
        )

    return {"id": str(practitioner_id)}
