import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type EncounterStatus = "planned" | "completed" | "cancelled" | "no_show";
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

const ENCOUNTER_SELECT_COLS = `
  id, user_id, practitioner_id, organization_id,
  type, status, class, start_at, end_at, notes, region, territory_id,
  attendees, transfer_of_value, disclosed_at,
  metadata, created_at, updated_at
`.trim();

const VALID_STATUSES: EncounterStatus[] = ["planned", "completed", "cancelled", "no_show"];
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
  const conditions: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  let i = 1;

  // Date range — use start_at for partition pruning (see migration 002)
  if (filters.start?.trim()) {
    conditions.push(`start_at >= $${i}::timestamptz`);
    params.push(filters.start.trim()); i++;
  }
  if (filters.end?.trim()) {
    conditions.push(`start_at <= $${i}::timestamptz`);
    params.push(filters.end.trim()); i++;
  }
  if (filters.region?.trim()) {
    conditions.push(`region = $${i}`);
    params.push(filters.region.trim()); i++;
  }
  if (filters.territory_id?.trim()) {
    conditions.push(`territory_id = $${i}`);
    params.push(filters.territory_id.trim()); i++;
  }
  if (filters.userId?.trim()) {
    conditions.push(`user_id = $${i}`);
    params.push(filters.userId.trim()); i++;
  }
  if (filters.status) {
    conditions.push(`status = $${i}`);
    params.push(filters.status); i++;
  }

  try {
    const result = await client.query<Encounter>(
      `SELECT ${ENCOUNTER_SELECT_COLS}
       FROM encounter
       WHERE ${conditions.join(" AND ")}
       ORDER BY start_at ASC`,
      params
    );
    return { rows: result.rows };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getEncounters", err);
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
    const result = await client.query<Encounter>(
      `INSERT INTO encounter
         (user_id, practitioner_id, organization_id,
          type, status, class, start_at, end_at, notes,
          region, territory_id, attendees, transfer_of_value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11,$12,$13,$14)
       RETURNING ${ENCOUNTER_SELECT_COLS}`,
      [
        input.user_id,
        input.practitioner_id  ?? null,
        input.organization_id  ?? null,
        input.type,
        input.status           ?? "planned",
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
    const row = result.rows[0];
    if (!row) throw new DatabaseError("insertEncounter", new Error("Insert returned no rows"));
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

    if (sets.length === 0) return existing;

    sets.push("updated_at = now()");
    params.push(id);

    await client.query(
      `UPDATE encounter SET ${sets.join(", ")} WHERE id = $${i}`,
      params
    );

    return getEncounterById(client, id);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateEncounter", err);
  }
}
