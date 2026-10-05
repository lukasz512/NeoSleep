import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

// Same set as the encounter_status_check constraint. "planned" was listed here
// instead of "scheduled", so every create hit the DB check (NEO-112).
export type EncounterStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type EncounterType   = "visit" | "call" | "email" | "congress" | "webinar" | "other";

/**
 * FHIR R4 ActEncounterCode — required on every Encounter resource.
 * Derived from EncounterType on insert. Stored explicitly so FHIR consumers
 * can read it without running the adapter mapping.
 */
export type EncounterClass = "AMB" | "VR" | "CONF" | "IMP";

/** Maps our internal encounter type to FHIR ActEncounterCode. */
export function typeToFhirClass(type: EncounterType): EncounterClass {
  switch (type) {
    case "visit":    return "AMB";   // ambulatory / in-person
    case "call":     return "VR";    // virtual
    case "email":    return "VR";    // virtual
    case "webinar":  return "VR";    // virtual
    case "congress": return "CONF";  // conference
    case "other":    return "AMB";
    default:         return "AMB";
  }
}

export interface Encounter {
  id: string;
  user_id: string;
  practitioner_id: string | null;
  organization_id: string | null;
  /** CORE-137: the patients the event is for (FHIR Encounter.subject), from encounter_patient. */
  patient_ids: string[];
  type: EncounterType;
  status: EncounterStatus;
  class: EncounterClass;
  start_at: Date;
  end_at: Date | null;
  notes: string | null;
  region: string | null;
  territory_id: string | null;
  attendees: string[];
  transfer_of_value: Record<string, unknown>;
  disclosed_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface GetEncounterFilters {
  start?: string;
  end?: string;
  region?: string;
  territory_id?: string;
  userId?: string | null;
  status?: EncounterStatus;
  /** CORE-137: only events linked to this patient (through encounter_patient). */
  patient_id?: string;
  /** CORE-106 row-level visibility — the one filter queries/encounter.ts's
   *  encounterVisibilityScope() produces and getEncounters() applies. Every
   *  role sees its own encounters (ownerId); manager/admin additionally see
   *  anything inside scopePaths (middleware/requireScope.ts), by
   *  encounter.territory_id — same ltree pattern as practitioner/organization/
   *  lead. undefined scopePaths = no widening (rep/kam/msl/doctor: owner-only).
   *  null scopePaths = unrestricted widening (global role scope). */
  visibility?: EncounterVisibilityScope;
}

export interface EncounterVisibilityScope {
  /** Always checked first — every role sees encounters it owns. */
  ownerId: string;
  scopePaths?: string[] | null;
}

export interface InsertEncounterInput {
  user_id: string;
  start_at: string;
  end_at?: string | null;
  type: EncounterType;
  status?: EncounterStatus;
  notes?: string | null;
  practitioner_id?: string | null;
  organization_id?: string | null;
  /** CORE-137: linked patients; the caller has already scope-checked them. */
  patient_ids?: string[];
  region?: string | null;
  territory_id?: string | null;
  attendees?: string[];
  transfer_of_value?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateEncounterInput {
  start_at?: string;
  end_at?: string | null;
  type?: EncounterType;
  status?: EncounterStatus;
  notes?: string | null;
  practitioner_id?: string | null;
  organization_id?: string | null;
  /** CORE-137: replaces the linked patients when given; undefined leaves them alone. */
  patient_ids?: string[];
  region?: string | null;
  territory_id?: string | null;
  attendees?: string[];
  transfer_of_value?: Record<string, unknown>;
  disclosed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const ENCOUNTER_COLUMNS = [
  "id", "user_id", "practitioner_id", "organization_id",
  "type", "status", "class", "start_at", "end_at", "notes", "region", "territory_id",
  "attendees", "transfer_of_value", "disclosed_at",
  "metadata", "created_at", "updated_at",
];

// CORE-137: the linked patients, aggregated from encounter_patient (text[] so pg returns plain strings).
const patientIdsSql = (alias: string) =>
  `COALESCE((SELECT array_agg(ep.patient_id::text ORDER BY ep.patient_id) FROM encounter_patient ep WHERE ep.encounter_id = ${alias}.id), '{}'::text[]) AS patient_ids`;

const ENCOUNTER_SELECT_COLS = `${ENCOUNTER_COLUMNS.join(", ")}, ${patientIdsSql("encounter")}`;
// Qualified with the `e` alias — needed once a query JOINs another table
// (territory, for the visibility scope check) that could otherwise make a
// bare column name like `id` ambiguous.
const ENCOUNTER_SELECT_COLS_E = `${ENCOUNTER_COLUMNS.map((c) => `e.${c}`).join(", ")}, ${patientIdsSql("e")}`;

const VALID_STATUSES: EncounterStatus[] = ["scheduled", "completed", "cancelled", "no_show"];
const VALID_TYPES: EncounterType[]      = ["visit", "call", "email", "congress", "webinar", "other"];

export function isEncounterStatus(s: string): s is EncounterStatus {
  return VALID_STATUSES.includes(s as EncounterStatus);
}

export function isEncounterType(s: string): s is EncounterType {
  return VALID_TYPES.includes(s as EncounterType);
}

// ---------------------------------------------------------------------------
// QUERIES — accept a PoolClient with search_path already set by withTenant()
// ---------------------------------------------------------------------------

export async function getEncounters(
  client: PoolClient,
  filters: GetEncounterFilters
): Promise<{ rows: Encounter[] }> {
  const conditions: string[] = ["e.deleted_at IS NULL"];
  const params: unknown[] = [];
  let i = 1;

  // Date range — use start_at for partition pruning (see migration 002)
  if (filters.start?.trim()) {
    conditions.push(`e.start_at >= $${i}::timestamptz`);
    params.push(filters.start.trim()); i++;
  }
  if (filters.end?.trim()) {
    conditions.push(`e.start_at <= $${i}::timestamptz`);
    params.push(filters.end.trim()); i++;
  }
  if (filters.region?.trim()) {
    conditions.push(`e.region = $${i}`);
    params.push(filters.region.trim()); i++;
  }
  if (filters.territory_id?.trim()) {
    conditions.push(`e.territory_id = $${i}`);
    params.push(filters.territory_id.trim()); i++;
  }
  if (filters.userId?.trim()) {
    conditions.push(`e.user_id = $${i}`);
    params.push(filters.userId.trim()); i++;
  }
  if (filters.patient_id?.trim()) {
    conditions.push(`EXISTS (SELECT 1 FROM encounter_patient fp WHERE fp.encounter_id = e.id AND fp.patient_id = $${i})`);
    params.push(filters.patient_id.trim()); i++;
  }
  if (filters.status) {
    conditions.push(`e.status = $${i}`);
    params.push(filters.status); i++;
  }
  // CORE-106: row-level visibility — see GetEncounterFilters.visibility's doc comment.
  if (filters.visibility) {
    const { ownerId, scopePaths } = filters.visibility;
    if (scopePaths === undefined) {
      // rep/kam/msl/doctor — own encounters only, no widening.
      conditions.push(`e.user_id = $${i}`);
      params.push(ownerId); i++;
    } else if (scopePaths !== null) {
      // manager/admin, restricted scope — own, OR inside the granted territory
      // (an unassigned territory_id is visible to everyone — same rollout-safety
      // fallback as practitioner/organization/lead's scopePaths filters).
      conditions.push(`(e.user_id = $${i} OR e.territory_id IS NULL OR t.path <@ ANY($${i + 1}::extensions.ltree[]))`);
      params.push(ownerId, scopePaths); i += 2;
    }
    // scopePaths === null: manager/admin with a global role scope — unrestricted, no condition.
  }

  try {
    const result = await client.query<Encounter>(
      `SELECT ${ENCOUNTER_SELECT_COLS_E}
       FROM encounter e
       LEFT JOIN territory t ON e.territory_id = t.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY e.start_at ASC`,
      params
    );
    return { rows: result.rows };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getEncounters", err);
  }
}

/** Replaces an encounter's linked patients with exactly `patientIds` (deduped). */
export async function setEncounterPatients(
  client: PoolClient,
  encounterId: string,
  patientIds: string[]
): Promise<void> {
  try {
    const ids = [...new Set(patientIds)];
    await client.query(
      `DELETE FROM encounter_patient WHERE encounter_id = $1 AND NOT (patient_id = ANY($2::uuid[]))`,
      [encounterId, ids]
    );
    if (ids.length > 0) {
      await client.query(
        `INSERT INTO encounter_patient (encounter_id, patient_id)
         SELECT $1, UNNEST($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [encounterId, ids]
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("setEncounterPatients", err);
  }
}

export async function getEncounterById(
  client: PoolClient,
  id: string
): Promise<Encounter | null> {
  try {
    const result = await client.query<Encounter>(
      `SELECT ${ENCOUNTER_SELECT_COLS}
       FROM encounter
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getEncounterById", err);
  }
}

export async function insertEncounter(
  client: PoolClient,
  input: InsertEncounterInput
): Promise<Encounter> {
  try {
    const fhirClass = typeToFhirClass(input.type);
    const result = await client.query<{ id: string }>(
      `INSERT INTO encounter
         (user_id, practitioner_id, organization_id,
          type, status, class, start_at, end_at, notes,
          region, territory_id, attendees, transfer_of_value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        input.user_id,
        input.practitioner_id  ?? null,
        input.organization_id  ?? null,
        input.type,
        input.status           ?? "scheduled",
        fhirClass,
        input.start_at,
        input.end_at           ?? null,
        input.notes            ?? null,
        input.region           ?? null,
        input.territory_id     ?? null,
        input.attendees        ?? [],
        JSON.stringify(input.transfer_of_value ?? {}),
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    const created = result.rows[0];
    if (!created) throw new DatabaseError("insertEncounter", new Error("Insert returned no rows"));
    await setEncounterPatients(client, created.id, input.patient_ids ?? []);
    const row = await getEncounterById(client, created.id);
    if (!row) throw new DatabaseError("insertEncounter", new Error("Inserted row not found"));
    return row;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertEncounter", err);
  }
}

export async function updateEncounter(
  client: PoolClient,
  id: string,
  input: UpdateEncounterInput
): Promise<Encounter | null> {
  const existing = await getEncounterById(client, id);
  if (!existing) return null;

  try {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    const push = (sql: string, val: unknown) => {
      sets.push(sql.replace("?", `$${i++}`));
      params.push(val);
    };

    if (input.start_at !== undefined)        push("start_at = ?::timestamptz", input.start_at);
    if (input.end_at !== undefined)          push("end_at = ?::timestamptz",   input.end_at);
    if (input.type !== undefined) {
      push("type = ?", input.type);
      push("class = ?", typeToFhirClass(input.type)); // keep class in sync with type
    }
    if (input.status !== undefined)          push("status = ?",              input.status);
    if (input.notes !== undefined)           push("notes = ?",               input.notes);
    if (input.region !== undefined)          push("region = ?",              input.region);
    if (input.territory_id !== undefined)    push("territory_id = ?",        input.territory_id);
    if (input.practitioner_id !== undefined) push("practitioner_id = ?",     input.practitioner_id);
    if (input.organization_id !== undefined) push("organization_id = ?",     input.organization_id);
    if (input.attendees !== undefined)       push("attendees = ?",           input.attendees);
    if (input.transfer_of_value !== undefined) push("transfer_of_value = ?", JSON.stringify(input.transfer_of_value));
    if (input.disclosed_at !== undefined)    push("disclosed_at = ?::timestamptz", input.disclosed_at);
    if (input.metadata !== undefined)        push("metadata = ?",            input.metadata ? JSON.stringify(input.metadata) : null);

    if (sets.length === 0 && input.patient_ids === undefined) return existing;

    if (sets.length > 0) {
      sets.push("updated_at = now()");
      params.push(id);
      await client.query(
        `UPDATE encounter SET ${sets.join(", ")} WHERE id = $${i}`,
        params
      );
    }
    if (input.patient_ids !== undefined) await setEncounterPatients(client, id, input.patient_ids);

    return getEncounterById(client, id);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateEncounter", err);
  }
}
