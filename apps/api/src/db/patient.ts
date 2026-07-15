import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";

function isoDate(val: Date | string | null | undefined): string {
  if (!val) return "";
  return val instanceof Date ? val.toISOString() : String(val);
}

export interface Patient {
  id: string;
  identity_id: string;
  // From identities JOIN
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  // From patient table
  practitioner_id: string | null;
  diagnosis_code: Record<string, unknown> | null;
  ahi_baseline: number | null;
  cpap_device: string | null;
  medical_record: string | null;
  region: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Computed from practitioner + identities JOIN (resolved display name, mirrors
  // practitioner.ts's own organization.name AS institution join for the same need)
  practitioner_name: string | null;
}

export interface GetPatientsFilters {
  search?: string;
  status?: string;
  region?: string;
}

export interface PatientInsert {
  salutation?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  practitioner_id?: string;
  diagnosis_code?: Record<string, unknown>;
  ahi_baseline?: number;
  cpap_device?: string;
  medical_record?: string;
  status?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}

export interface PatientUpdate {
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  practitioner_id?: string;
  diagnosis_code?: Record<string, unknown>;
  ahi_baseline?: number;
  cpap_device?: string;
  medical_record?: string;
  status?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}

function buildName(p: { salutation: string | null; first_name: string; last_name: string }): string {
  return [p.salutation, p.first_name, p.last_name].filter(Boolean).join(" ");
}

const PATIENT_SELECT_COLS = `
  p.id, p.identity_id, p.practitioner_id, p.diagnosis_code, p.ahi_baseline,
  p.cpap_device, p.medical_record, p.region, p.status, p.metadata,
  p.created_at, p.updated_at,
  i.title AS salutation, i.first_name, i.last_name, i.email, i.phone,
  pi.first_name AS practitioner_first_name, pi.last_name AS practitioner_last_name`.trim();

// Shared FROM/JOIN fragment for the two read queries below — resolves the
// assigned practitioner's display name via practitioner + identities, mirroring
// how practitioner.ts's own list/detail queries LEFT JOIN organization for
// "institution" (same resolved-display-name need, same no-deleted_at-filter shape).
const PATIENT_JOIN = `
  FROM patient p
  JOIN identities i ON p.identity_id = i.id
  LEFT JOIN practitioner pr ON p.practitioner_id = pr.id
  LEFT JOIN identities pi ON pr.identity_id = pi.id`.trim();

type PatientRow = {
  id: string;
  identity_id: string;
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  practitioner_id: string | null;
  diagnosis_code: Record<string, unknown> | null;
  ahi_baseline: number | null;
  cpap_device: string | null;
  medical_record: string | null;
  region: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  practitioner_first_name: string | null;
  practitioner_last_name: string | null;
};

function buildPractitionerName(row: {
  practitioner_first_name: string | null;
  practitioner_last_name: string | null;
}): string | null {
  const name = [row.practitioner_first_name, row.practitioner_last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

function serialize(row: PatientRow): Patient & { name: string } {
  return {
    id: row.id,
    identity_id: row.identity_id,
    salutation: row.salutation,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    practitioner_id: row.practitioner_id,
    diagnosis_code: row.diagnosis_code,
    ahi_baseline: row.ahi_baseline,
    cpap_device: row.cpap_device,
    medical_record: row.medical_record,
    region: row.region,
    status: row.status,
    metadata: row.metadata,
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
    practitioner_name: buildPractitionerName(row),
    name: buildName(row),
  };
}

export async function getPatientsPaginated(
  client: PoolClient,
  filters: GetPatientsFilters,
  page: number,
  limit: number,
  sortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc"
): Promise<{ rows: (Patient & { name: string })[]; total: number }> {
  const allowed = ["created_at", "last_name", "first_name", "status", "region"];
  const col = allowed.includes(sortBy) ? sortBy : "created_at";
  const dir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeCol = ["first_name", "last_name"].includes(col) ? `i.${col}` : `p.${col}`;

  const conditions: string[] = ["p.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    conditions.push(
      `(LOWER(i.first_name || ' ' || i.last_name) LIKE $${params.length}
       OR LOWER(p.region) LIKE $${params.length})`
    );
  }
  if (filters.status?.trim()) {
    params.push(filters.status.trim());
    conditions.push(`p.status = $${params.length}`);
  }
  if (filters.region?.trim()) {
    params.push(filters.region.trim());
    conditions.push(`p.region = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM patient p JOIN identities i ON p.identity_id = i.id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<PatientRow>(
      `SELECT ${PATIENT_SELECT_COLS}
       ${PATIENT_JOIN}
       ${where}
       ORDER BY ${safeCol} ${dir}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: dataResult.rows.map(serialize), total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPatientsPaginated", err);
  }
}

export async function getPatientById(client: PoolClient, id: string): Promise<(Patient & { name: string }) | null> {
  try {
    const result = await client.query<PatientRow>(
      `SELECT ${PATIENT_SELECT_COLS}
       ${PATIENT_JOIN}
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id]
    );
    if (!result.rows[0]) return null;
    return serialize(result.rows[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPatientById", err);
  }
}

/**
 * Inserts a patient + identity record using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 * No BEGIN/COMMIT here — the caller owns the transaction boundary.
 */
export async function insertPatient(client: PoolClient, data: PatientInsert): Promise<Patient & { name: string }> {
  try {
    const identityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        data.salutation ?? null,
        data.first_name,
        data.last_name,
        data.email ?? null,
        data.phone ?? null,
      ]
    );
    const identityId = identityResult.rows[0]!.id;

    const patientResult = await client.query<{ id: string }>(
      `INSERT INTO patient (identity_id, practitioner_id, diagnosis_code, ahi_baseline, cpap_device, medical_record, status, region, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        identityId,
        data.practitioner_id ?? null,
        data.diagnosis_code ? JSON.stringify(data.diagnosis_code) : null,
        data.ahi_baseline ?? null,
        data.cpap_device ?? null,
        data.medical_record ?? null,
        data.status ?? "active",
        data.region ?? "",
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
    const patientId = patientResult.rows[0]!.id;

    const row = await getPatientById(client, patientId);
    if (!row) throw new DatabaseError("insertPatient", new Error("Insert returned no rows"));
    return row;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertPatient", err);
  }
}

/**
 * Updates patient + identity fields using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 */
export async function updatePatient(
  client: PoolClient,
  id: string,
  data: PatientUpdate
): Promise<(Patient & { name: string }) | null> {
  const existing = await getPatientById(client, id);
  if (!existing) return null;

  try {
    // Update identities row
    const identitySets: string[] = ["updated_at = now()"];
    const identityParams: unknown[] = [];
    let idx = 1;

    // JS field name -> actual identities column name (identities.title stores what the app calls "salutation")
    const identityFieldToColumn: Partial<Record<keyof PatientUpdate, string>> = {
      salutation: "title",
      first_name: "first_name",
      last_name: "last_name",
      email: "email",
      phone: "phone",
    };
    for (const [field, column] of Object.entries(identityFieldToColumn) as [keyof PatientUpdate, string][]) {
      if (data[field] !== undefined) {
        identityParams.push(data[field] ?? null);
        identitySets.push(`${column} = $${idx++}`);
      }
    }
    identityParams.push(existing.identity_id);
    await client.query(
      `UPDATE identities SET ${identitySets.join(", ")} WHERE id = $${idx}`,
      identityParams
    );

    // Update patient row
    const patientSets: string[] = ["updated_at = now()"];
    const patientParams: unknown[] = [];
    let pidx = 1;

    const patientFields: (keyof PatientUpdate)[] = [
      "practitioner_id", "diagnosis_code", "ahi_baseline",
      "cpap_device", "medical_record", "status", "region", "metadata",
    ];
    for (const field of patientFields) {
      if (data[field] !== undefined) {
        const val = ["diagnosis_code", "metadata"].includes(field) && data[field] != null
          ? JSON.stringify(data[field])
          : (data[field] ?? null);
        patientParams.push(val);
        patientSets.push(`${field} = $${pidx++}`);
      }
    }
    patientParams.push(id);
    await client.query(
      `UPDATE patient SET ${patientSets.join(", ")} WHERE id = $${pidx}`,
      patientParams
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updatePatient", err);
  }

  return getPatientById(client, id);
}

/**
 * Soft-deletes a patient by setting deleted_at — status is left untouched:
 * the patient status CHECK doesn't even have an 'inactive' value
 * ('active'|'follow_up'|'discharged'), and every read query already filters
 * deleted_at IS NULL, so deleted_at alone is sufficient for visibility.
 */
export async function softDeletePatient(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE patient SET deleted_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("softDeletePatient", err);
  }
}
