import type { PoolClient } from "pg";
import { AppError, ConflictError, DatabaseError } from "../errors.js";
import { isoDate } from "../routes/utils.js";
import { formatOptionalDisplayName } from "../utils/personName.js";

// DB CHECK constraints — see migrations/034_appointment.sql.
export const APPOINTMENT_STATUSES = ["scheduled", "completed", "cancelled", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_TYPES = ["visit"] as const;
export const APPOINTMENT_LOCATION_TYPES = ["clinic", "online"] as const;

/** A range query never returns more than this — an agenda shows a day or a week. */
export const APPOINTMENT_LIST_MAX = 500;

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  practitioner_id: string;
  practitioner_name: string | null;
  practitioner_first_name: string | null;
  practitioner_last_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  territory_id: string | null;
  sleep_study_id: string | null;
  treatment_plan_id: string | null;
  created_by_user_id: string;
  type: string;
  status: AppointmentStatus;
  start_at: string;
  end_at: string;
  timezone: string;
  location_type: string;
  online_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentInsert {
  patient_id: string;
  practitioner_id: string;
  organization_id: string | null;
  territory_id: string | null;
  sleep_study_id?: string | null;
  treatment_plan_id?: string | null;
  created_by_user_id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  location_type?: string;
  online_url?: string | null;
  notes?: string | null;
}

export interface AppointmentUpdate {
  start_at?: string;
  end_at?: string;
  status?: AppointmentStatus;
  notes?: string | null;
  sleep_study_id?: string | null;
  treatment_plan_id?: string | null;
}

export interface AppointmentFilters {
  /** Overlap window: appointments that end after `start` and start before `end`. */
  start?: string;
  end?: string;
  patient_id?: string;
  practitioner_id?: string;
  /** null = unrestricted; otherwise ltree paths from getAllowedScopePaths (unassigned territory passes, as for patients). */
  scope_paths: string[] | null;
}

type AppointmentRow = Omit<Appointment, "patient_name" | "practitioner_name" | "start_at" | "end_at" | "created_at" | "updated_at"> & {
  patient_salutation: string | null;
  practitioner_salutation: string | null;
  start_at: Date;
  end_at: Date;
  created_at: Date;
  updated_at: Date;
};

const SELECT_COLS = `
  a.id, a.patient_id, a.practitioner_id, a.organization_id, a.territory_id, a.sleep_study_id,
  a.treatment_plan_id, a.created_by_user_id, a.type, a.status, a.start_at, a.end_at, a.timezone,
  a.location_type, a.online_url, a.notes, a.created_at, a.updated_at,
  pi.title AS patient_salutation, pi.first_name AS patient_first_name, pi.last_name AS patient_last_name,
  di.title AS practitioner_salutation, di.first_name AS practitioner_first_name, di.last_name AS practitioner_last_name,
  o.name AS organization_name`.trim();

const JOIN = `
  FROM appointment a
  JOIN patient p ON a.patient_id = p.id
  JOIN identities pi ON p.identity_id = pi.id
  JOIN practitioner d ON a.practitioner_id = d.id
  JOIN identities di ON d.identity_id = di.id
  LEFT JOIN organization o ON a.organization_id = o.id
  LEFT JOIN territory t ON a.territory_id = t.id`.trim();

function serialize(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    patient_id: row.patient_id,
    patient_name: formatOptionalDisplayName({ salutation: row.patient_salutation, first_name: row.patient_first_name, last_name: row.patient_last_name }),
    patient_first_name: row.patient_first_name,
    patient_last_name: row.patient_last_name,
    practitioner_id: row.practitioner_id,
    practitioner_name: formatOptionalDisplayName({ salutation: row.practitioner_salutation, first_name: row.practitioner_first_name, last_name: row.practitioner_last_name }),
    practitioner_first_name: row.practitioner_first_name,
    practitioner_last_name: row.practitioner_last_name,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    territory_id: row.territory_id,
    sleep_study_id: row.sleep_study_id,
    treatment_plan_id: row.treatment_plan_id,
    created_by_user_id: row.created_by_user_id,
    type: row.type,
    status: row.status,
    start_at: isoDate(row.start_at),
    end_at: isoDate(row.end_at),
    timezone: row.timezone,
    location_type: row.location_type,
    online_url: row.online_url,
    notes: row.notes,
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

/** SQLSTATE 23P01 = exclusion_violation → the practitioner already has an appointment in that slot. */
function rethrow(operation: string, err: unknown): never {
  if (err instanceof AppError) throw err;
  if ((err as { code?: string }).code === "23P01") {
    throw new ConflictError("The doctor already has an appointment at this time");
  }
  throw new DatabaseError(operation, err);
}

export async function getAppointments(client: PoolClient, filters: AppointmentFilters): Promise<Appointment[]> {
  const conditions = ["a.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (filters.start) {
    params.push(filters.start);
    conditions.push(`a.end_at > $${params.length}`);
  }
  if (filters.end) {
    params.push(filters.end);
    conditions.push(`a.start_at < $${params.length}`);
  }
  if (filters.patient_id) {
    params.push(filters.patient_id);
    conditions.push(`a.patient_id = $${params.length}`);
  }
  if (filters.practitioner_id) {
    params.push(filters.practitioner_id);
    conditions.push(`a.practitioner_id = $${params.length}`);
  }
  if (filters.scope_paths !== null) {
    params.push(filters.scope_paths);
    conditions.push(`(a.territory_id IS NULL OR t.path <@ ANY($${params.length}::extensions.ltree[]))`);
  }
  params.push(APPOINTMENT_LIST_MAX);
  try {
    const { rows } = await client.query<AppointmentRow>(
      `SELECT ${SELECT_COLS} ${JOIN} WHERE ${conditions.join(" AND ")} ORDER BY a.start_at ASC LIMIT $${params.length}`,
      params
    );
    return rows.map(serialize);
  } catch (err) {
    rethrow("getAppointments", err);
  }
}

export async function getAppointmentById(client: PoolClient, id: string): Promise<Appointment | null> {
  try {
    const { rows } = await client.query<AppointmentRow>(
      `SELECT ${SELECT_COLS} ${JOIN} WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [id]
    );
    return rows[0] ? serialize(rows[0]) : null;
  } catch (err) {
    rethrow("getAppointmentById", err);
  }
}

export async function insertAppointment(client: PoolClient, data: AppointmentInsert): Promise<Appointment> {
  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO appointment (
         patient_id, practitioner_id, organization_id, territory_id, sleep_study_id, treatment_plan_id,
         created_by_user_id, start_at, end_at, timezone, location_type, online_url, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        data.patient_id,
        data.practitioner_id,
        data.organization_id,
        data.territory_id,
        data.sleep_study_id ?? null,
        data.treatment_plan_id ?? null,
        data.created_by_user_id,
        data.start_at,
        data.end_at,
        data.timezone,
        data.location_type ?? "clinic",
        data.online_url ?? null,
        data.notes ?? null,
      ]
    );
    const row = await getAppointmentById(client, rows[0]!.id);
    if (!row) throw new DatabaseError("insertAppointment", new Error("Insert returned no rows"));
    return row;
  } catch (err) {
    rethrow("insertAppointment", err);
  }
}

export async function updateAppointment(client: PoolClient, id: string, data: AppointmentUpdate): Promise<Appointment | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of ["start_at", "end_at", "status", "notes", "sleep_study_id", "treatment_plan_id"] as const) {
    if (data[key] !== undefined) {
      params.push(data[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) return getAppointmentById(client, id);
  params.push(id);
  try {
    const { rowCount } = await client.query(
      `UPDATE appointment SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length} AND deleted_at IS NULL`,
      params
    );
    return rowCount ? getAppointmentById(client, id) : null;
  } catch (err) {
    rethrow("updateAppointment", err);
  }
}

export async function softDeleteAppointment(client: PoolClient, id: string): Promise<boolean> {
  try {
    const { rowCount } = await client.query(
      `UPDATE appointment SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  } catch (err) {
    rethrow("softDeleteAppointment", err);
  }
}

/** The tenant's configured default zone (app_config.timezone) — last fallback when the clinic's country is unknown. */
export async function getTenantDefaultTimezone(client: PoolClient): Promise<string> {
  try {
    const { rows } = await client.query<{ timezone: string }>(`SELECT timezone FROM app_config LIMIT 1`);
    return rows[0]?.timezone || "UTC";
  } catch (err) {
    rethrow("getTenantDefaultTimezone", err);
  }
}
