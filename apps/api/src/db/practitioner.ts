import type { PoolClient } from "pg";
import { toArray, trimOrNull, trimOrEmpty } from "./helpers.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";
import { assertEmailNotTaken } from "./identityEmail.js";

export interface Practitioner {
  id: string;
  identity_id: string;
  // From identities JOIN
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  social_links: Record<string, unknown> | null;
  // From practitioner table
  organization_id: string | null;
  national_ids: Record<string, string> | null;
  primary_specialty: string | null;
  specialties: string[];
  influence_tier: string;
  region: string;
  territory_id: string | null;
  // Immediate assigned territory node's own name (not the full ancestor
  // path — see queries/territory.ts's getTerritoryPath for that, used by the
  // single-record detail query only, to avoid an extra query per list row).
  territory_name: string | null;
  country_code: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  // Computed from organization JOIN
  institution: string | null;
  // Only selected when GetPractitionerFilters.includeStats is set (see PRAC_STATS_* below)
  patient_count?: number;
  device_count?: number;
  efficiency_pct?: number | null;
}

export interface GetPractitionerFilters {
  search?: string;
  specialty?: string | string[];
  institution?: string | string[];
  region?: string | string[];
  /** Matches the primary `practitioner.organization_id` OR any `practitioner_organization` affiliation (NEO-17). */
  organization_id?: string;
  /** RBAC territory scope (migration 022) — see GetPatientsFilters.scopePaths for the contract. */
  scopePaths?: string[] | null;
  /** Adds patient_count / device_count / efficiency_pct per row (HCO "Médicos" tab, NEO-14). */
  includeStats?: boolean;
}

export interface InsertPractitionerInput {
  first_name: string;
  last_name: string;
  salutation?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  /** Prefer this when the clinic is already a known organization id — falls
   *  back to the freetext institution-name-resolve flow only when absent. */
  organization_id?: string | null;
  institution?: string | null;
  region?: string;
  territory_id?: string | null;
  /** RBAC scope for the eventual doctor-role user (see ActivatePractitionerCommand) — not the same as `region`, see requireScope.ts. */
  country_code?: string | null;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
  /** Defaults to 'pending_approval' — every practitioner needs training completed (see ActivatePractitionerCommand) before going 'active' and becoming visible on the public map. */
  status?: "pending_approval" | "invited" | "active" | "inactive";
}

export interface UpdatePractitionerInput {
  first_name?: string;
  last_name?: string;
  salutation?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  organization_id?: string | null;
  institution?: string | null;
  region?: string;
  territory_id?: string | null;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
  /**
   * Admin-only manual override (see apps/pwa/src/config/forms/hcpForm.ts's
   * STATUS_OPTIONS for the full rationale) — a recovery tool for a
   * practitioner stuck in a state the normal Activate/Resend/Accept flow
   * can't get them out of (e.g. one that reached "active" under the
   * pre-025_practitioner_invited_status.sql bug with no real account
   * behind it). Ordinary status transitions still go through
   * updatePractitionerStatus() (ActivatePractitionerCommand,
   * AcceptPractitionerInviteCommand) — this is the one path that lets a
   * human directly override it instead.
   */
  status?: "pending_approval" | "invited" | "active" | "inactive";
}

const PRAC_SORT_COLUMNS = ["first_name", "last_name", "email", "primary_specialty", "region", "influence_tier", "created_at"] as const;

const PRAC_SELECT_COLS = `
  p.id, p.identity_id, p.organization_id, p.national_ids,
  p.primary_specialty, p.specialties, p.influence_tier,
  p.status, p.metadata,
  p.created_at, p.updated_at,
  i.title AS salutation, i.first_name, i.last_name, i.email, i.phone, i.language, i.social_links,
  COALESCE(i.region, '') AS region, i.territory_id, t.name AS territory_name, i.country_code,
  o.name AS institution`.trim();

/**
 * Per-doctor stats for the HCO "Médicos" table (NEO-14, docs/stories/hco-medicos-table.md):
 * - patient_count: non-deleted patients attributed to the doctor (patient.practitioner_id)
 * - device_count: DAN/MAD devices ordered through OrthoApnea for the doctor
 *   (treatment_plan.dentist_id) — dental_appliance, not cancelled, not deleted,
 *   and not a local draft never sent to OrthoApnea (metadata.orthoapneaDraft)
 * - efficiency_pct: device_count / patient_count as a rounded %, NULL for 0 patients
 */
const PRAC_STATS_JOINS = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS patient_count
    FROM patient pa
    WHERE pa.practitioner_id = p.id AND pa.deleted_at IS NULL
  ) ps ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS device_count
    FROM treatment_plan tp
    WHERE tp.dentist_id = p.id
      AND tp.type = 'dental_appliance'
      AND tp.status <> 'cancelled'
      AND tp.deleted_at IS NULL
      AND NOT (COALESCE(tp.metadata, '{}'::jsonb) ? 'orthoapneaDraft')
  ) ds ON true`;

const PRAC_STATS_COLS = `,
  ps.patient_count, ds.device_count,
  CASE WHEN ps.patient_count = 0 THEN NULL
       ELSE ROUND(ds.device_count * 100.0 / ps.patient_count)::int END AS efficiency_pct`;

const PRAC_STATS_SORT_COLUMNS = ["patient_count", "device_count", "efficiency_pct"] as const;

function isPracStatsSortColumn(s: string): s is (typeof PRAC_STATS_SORT_COLUMNS)[number] {
  return PRAC_STATS_SORT_COLUMNS.includes(s as (typeof PRAC_STATS_SORT_COLUMNS)[number]);
}

function isPracSortColumn(s: string): s is (typeof PRAC_SORT_COLUMNS)[number] {
  return PRAC_SORT_COLUMNS.includes(s as (typeof PRAC_SORT_COLUMNS)[number]);
}

/**
 * Resolves or creates an organization by name, using the tenant-scoped client.
 * Must run on the same client as the surrounding transaction.
 */
async function resolveOrganizationId(
  client: PoolClient,
  name: string,
  region: string
): Promise<{ id: string; name: string }> {
  // No unique constraint on organization.name exists, so this can't be an
  // ON CONFLICT upsert — look up first, insert only if nothing matched.
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM organization WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
    [name]
  );
  if (existing.rows[0]) return { id: existing.rows[0].id, name };

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO organization (name, region, status) VALUES ($1, $2, 'active') RETURNING id`,
    [name, region]
  );
  return { id: inserted.rows[0]!.id, name };
}

export async function getPractitionerPaginated(
  client: PoolClient,
  filters: GetPractitionerFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: Practitioner[]; total: number }> {
  const conditions: string[] = ["p.deleted_at IS NULL"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(
      `(LOWER(i.first_name) LIKE $${paramIndex} OR LOWER(i.last_name) LIKE $${paramIndex} OR LOWER(COALESCE(i.email,'')) LIKE $${paramIndex} OR LOWER(COALESCE(p.primary_specialty,'')) LIKE $${paramIndex} OR LOWER(COALESCE(o.name,'')) LIKE $${paramIndex} OR LOWER(COALESCE(i.region,'')) LIKE $${paramIndex})`
    );
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  const specialtyArr = toArray(filters.specialty);
  if (specialtyArr.length > 0) {
    conditions.push(`p.primary_specialty = ANY($${paramIndex}::text[])`);
    params.push(specialtyArr);
    paramIndex++;
  }
  const institutionArr = toArray(filters.institution);
  if (institutionArr.length > 0) {
    conditions.push(`o.name = ANY($${paramIndex}::text[])`);
    params.push(institutionArr);
    paramIndex++;
  }
  const regionArr = toArray(filters.region);
  if (regionArr.length > 0) {
    conditions.push(`i.region = ANY($${paramIndex}::text[])`);
    params.push(regionArr);
    paramIndex++;
  }
  if (filters.organization_id?.trim()) {
    conditions.push(
      `(p.organization_id = $${paramIndex} OR EXISTS (SELECT 1 FROM practitioner_organization po WHERE po.practitioner_id = p.id AND po.organization_id = $${paramIndex}))`
    );
    params.push(filters.organization_id.trim());
    paramIndex++;
  }
  if (filters.scopePaths !== undefined && filters.scopePaths !== null) {
    conditions.push(`(i.territory_id IS NULL OR t.path <@ ANY($${paramIndex}::extensions.ltree[]))`);
    params.push(filters.scopePaths);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  let safeOrder: string;
  if (filters.includeStats && isPracStatsSortColumn(sortBy)) {
    safeOrder = `${sortBy} ${orderDir} NULLS LAST, p.id`;
  } else if (sortBy === "name") {
    safeOrder = `i.last_name ${orderDir}, i.first_name ${orderDir}`;
  } else {
    const orderCol = isPracSortColumn(sortBy) ? sortBy : "created_at";
    // created_at / primary_specialty / influence_tier live on practitioner, the rest on identities
    const table = orderCol === "created_at" || orderCol === "primary_specialty" || orderCol === "influence_tier" ? "p" : "i";
    safeOrder = `${table}."${orderCol}" ${orderDir}`;
  }

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM practitioner p
       JOIN identities i ON p.identity_id = i.id
       LEFT JOIN organization o ON p.organization_id = o.id
       LEFT JOIN territory t ON i.territory_id = t.id
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<Practitioner>(
      `SELECT ${PRAC_SELECT_COLS}${filters.includeStats ? PRAC_STATS_COLS : ""}
       FROM practitioner p
       JOIN identities i ON p.identity_id = i.id
       LEFT JOIN organization o ON p.organization_id = o.id
       LEFT JOIN territory t ON i.territory_id = t.id
       ${filters.includeStats ? PRAC_STATS_JOINS : ""}
       ${whereClause} ORDER BY ${safeOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPractitionerPaginated", err);
  }
}

export async function getPractitionerById(client: PoolClient, id: string): Promise<Practitioner | null> {
  try {
    const result = await client.query<Practitioner>(
      `SELECT ${PRAC_SELECT_COLS}
       FROM practitioner p
       JOIN identities i ON p.identity_id = i.id
       LEFT JOIN organization o ON p.organization_id = o.id
       LEFT JOIN territory t ON i.territory_id = t.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPractitionerById", err);
  }
}

/**
 * The practitioner's linked doctor-role users row, if any (ADR-014 identity
 * linkage: practitioner and users(doctor) share identity_id). Used by
 * queries/entityDocuments.ts to also surface the doctor's signed GDPR
 * consent/partner-agreement documents — those are written with
 * entity_type="user" (see commands/invitePractitioner.ts), not
 * entity_type="practitioner", since they're generated during the doctor's
 * account-activation flow, before the practitioner Documents tab existed.
 */
export async function getLinkedUserIdForPractitioner(client: PoolClient, practitionerId: string): Promise<string | null> {
  try {
    const result = await client.query<{ id: string }>(
      `SELECT u.id
       FROM users u
       JOIN practitioner p ON p.identity_id = u.identity_id
       WHERE p.id = $1 AND u.deleted_at IS NULL`,
      [practitionerId]
    );
    return result.rows[0]?.id ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getLinkedUserIdForPractitioner", err);
  }
}

/**
 * Inserts a practitioner + identity record using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 * No BEGIN/COMMIT here — the caller owns the transaction boundary.
 */
export async function insertPractitioner(client: PoolClient, input: InsertPractitionerInput): Promise<Practitioner> {
  const firstName = trimOrEmpty(input.first_name);
  const lastName = trimOrEmpty(input.last_name);
  if (!firstName || !lastName) throw new ValidationError("Practitioner first_name and last_name are required", "first_name");

  const region = trimOrEmpty(input.region);

  try {
    const orgId = input.organization_id !== undefined
      ? input.organization_id
      : input.institution?.trim()
        ? (await resolveOrganizationId(client, input.institution.trim(), region)).id
        : null;

    // ON CONFLICT (email): if this email already belongs to an identity (e.g.
    // the person already has a `users` account — see invitePractitioner.ts,
    // which relies on this to link a practitioner-user's two rows to the same
    // identity), reuse that identity_id instead of erroring. Mirrors
    // insertStaffUser's (db/users.ts) identical upsert.
    const identityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone, language, social_links, region, territory_id, country_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (email) WHERE NOT email_shared DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [
        trimOrNull(input.salutation),
        firstName,
        lastName,
        trimOrNull(input.email),
        trimOrNull(input.phone),
        // identities.language is NOT NULL — listing the column explicitly (for
        // social_links/region right after it) means the table's own DEFAULT
        // 'en' never kicks in, so an absent input.language must be defaulted
        // here instead, the same way inferLanguage() already does for email
        // copy in invitePractitioner.ts.
        trimOrNull(input.language) || "en",
        JSON.stringify(input.social_links ?? {}),
        region || null,
        input.territory_id ?? null,
        trimOrNull(input.country_code),
      ]
    );
    const identityId = identityResult.rows[0]!.id;

    // ON CONFLICT (identity_id) DO NOTHING: this identity may already have a
    // practitioner row (e.g. invited as a partner before, or added as an HCP
    // after). Link to the existing row instead of failing.
    const pracResult = await client.query<{ id: string }>(
      `INSERT INTO practitioner (identity_id, organization_id, primary_specialty, influence_tier, status, national_ids)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (identity_id) DO NOTHING
       RETURNING id`,
      [
        identityId,
        orgId ?? null,
        trimOrNull(input.primary_specialty),
        input.influence_tier ?? "C",
        input.status ?? "pending_approval",
        input.national_ids ? JSON.stringify(input.national_ids) : null,
      ]
    );
    const pracId = pracResult.rows[0]
      ? pracResult.rows[0].id
      : (await client.query<{ id: string }>(
          `SELECT id FROM practitioner WHERE identity_id = $1`,
          [identityId]
        )).rows[0]!.id;

    const row = await getPractitionerById(client, pracId);
    if (!row) throw new DatabaseError("insertPractitioner", new Error("Insert returned no rows"));
    return row;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertPractitioner", err);
  }
}

/**
 * Updates practitioner + identity fields using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 */
export async function updatePractitioner(client: PoolClient, id: string, input: UpdatePractitionerInput): Promise<Practitioner | null> {
  const existing = await getPractitionerById(client, id);
  if (!existing) return null;

  try {
    const firstName = input.first_name !== undefined ? trimOrEmpty(input.first_name) : existing.first_name;
    const lastName = input.last_name !== undefined ? trimOrEmpty(input.last_name) : existing.last_name;
    const salutation = input.salutation !== undefined ? trimOrNull(input.salutation) : existing.salutation;
    const email = input.email !== undefined ? trimOrNull(input.email) : existing.email;
    const phone = input.phone !== undefined ? trimOrNull(input.phone) : existing.phone;
    const language = input.language !== undefined ? trimOrNull(input.language) : existing.language;
    const primarySpecialty = input.primary_specialty !== undefined ? trimOrNull(input.primary_specialty) : existing.primary_specialty;
    const region = input.region ?? existing.region ?? "";
    const territoryId = input.territory_id !== undefined ? input.territory_id : existing.territory_id;
    const influenceTier = input.influence_tier ?? existing.influence_tier;
    const nationalIds = input.national_ids !== undefined ? input.national_ids : existing.national_ids;
    const socialLinks = input.social_links !== undefined ? input.social_links : existing.social_links;
    const status = input.status ?? existing.status;

    let orgId: string | null;
    if (input.organization_id !== undefined) {
      orgId = input.organization_id;
    } else {
      const institutionInput = input.institution !== undefined ? trimOrNull(input.institution) : (existing.institution ?? null);
      orgId = institutionInput ? (await resolveOrganizationId(client, institutionInput, region)).id : null;
    }

    // Pre-check rather than letting the UPDATE hit identities_email_unique_not_shared —
    // a plain UPDATE has no ON CONFLICT clause to fall back to like
    // insertPractitioner's upsert above, so a collision here would otherwise
    // surface as an opaque 23505 (see getOrganizationIdByName for the same
    // pre-check pattern against organization_name_unique_idx).
    if (email && email !== existing.email) await assertEmailNotTaken(client, email, existing.identity_id);

    await client.query(
      `UPDATE identities SET title = $1, first_name = $2, last_name = $3, email = $4, phone = $5, language = $6, social_links = $7, region = $8, territory_id = $9, updated_at = now()
       WHERE id = $10`,
      [salutation, firstName, lastName, email, phone, language, JSON.stringify(socialLinks ?? {}), region || null, territoryId, existing.identity_id]
    );

    await client.query(
      `UPDATE practitioner SET organization_id = $1, primary_specialty = $2, influence_tier = $3, national_ids = $4, status = $5, updated_at = now()
       WHERE id = $6`,
      [orgId ?? null, primarySpecialty, influenceTier, nationalIds ? JSON.stringify(nationalIds) : null, status, id]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updatePractitioner", err);
  }

  return getPractitionerById(client, id);
}

/**
 * practitioner and users are separate TPT-pattern tables both hanging off
 * the same identities row (see CLAUDE.md) — this is how
 * AcceptPractitionerInviteCommand, which only ever has the users.id it's
 * acting on, finds the matching practitioner row to flip its status. Null
 * is a legitimate result for a non-practitioner user (e.g. staff), not an
 * error.
 */
export async function getPractitionerIdByIdentityId(client: PoolClient, identityId: string): Promise<string | null> {
  try {
    const r = await client.query<{ id: string }>(`SELECT id FROM practitioner WHERE identity_id = $1`, [identityId]);
    return r.rows[0]?.id ?? null;
  } catch (err) {
    throw new DatabaseError("getPractitionerIdByIdentityId", err);
  }
}

/** Sets practitioner.status directly — used by ActivatePractitionerCommand (pending_approval/invited transitions) and AcceptPractitionerInviteCommand (the invited -> active transition, once the doctor actually completes registration — see commands/practitioner.ts and commands/invitePractitioner.ts). */
export async function updatePractitionerStatus(
  client: PoolClient,
  id: string,
  status: "pending_approval" | "invited" | "active" | "inactive"
): Promise<void> {
  try {
    await client.query(`UPDATE practitioner SET status = $1, updated_at = now() WHERE id = $2`, [status, id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updatePractitionerStatus", err);
  }
}

/**
 * Soft-deletes a practitioner by setting deleted_at — status is left
 * untouched (every read query already filters deleted_at IS NULL, so that
 * alone is sufficient for visibility; see softDeleteLead for the same call).
 */
export async function softDeletePractitioner(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE practitioner SET deleted_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("softDeletePractitioner", err);
  }
}
