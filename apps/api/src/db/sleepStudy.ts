import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import { isoDate } from "../routes/utils.js";

export const SLEEP_STUDY_STATUSES = [
  "ordered",
  "device_shipped",
  "device_delivered",
  "study_complete",
  "results_received",
  "interpreted",
  "cancelled",
] as const;
export type SleepStudyStatus = (typeof SLEEP_STUDY_STATUSES)[number];

export interface SleepStudy {
  id: string;
  patient_id: string;
  patient_name: string | null;
  purchase_order_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  device_serial: string | null;
  device_shipped_at: string | null;
  device_delivered_at: string | null;
  device_returned_at: string | null;
  study_date: string | null;
  results_received_at: string | null;
  raw_results: Record<string, unknown> | null;
  ahi_score: number | null;
  spo2_nadir: number | null;
  odi: number | null;
  interpreted_by: string | null;
  interpreted_by_name: string | null;
  interpreted_at: string | null;
  interpretation: string | null;
  diagnosis_code: Record<string, unknown> | null;
  oa_indicated: boolean | null;
  cpap_indicated: boolean | null;
  status: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface GetSleepStudiesFilters {
  patient_id?: string;
  status?: string;
  /** Matches against the patient's name — the sidebar cross-patient list's only searchable field. */
  search?: string;
}

export interface SleepStudyInsert {
  patient_id: string;
  purchase_order_id?: string;
  supplier_id?: string;
  device_serial?: string;
  device_shipped_at?: string;
  device_delivered_at?: string;
  device_returned_at?: string;
  study_date?: string;
  results_received_at?: string;
  raw_results?: Record<string, unknown>;
  ahi_score?: number;
  spo2_nadir?: number;
  odi?: number;
  interpreted_by?: string;
  interpreted_at?: string;
  interpretation?: string;
  diagnosis_code?: Record<string, unknown>;
  oa_indicated?: boolean;
  cpap_indicated?: boolean;
  status?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export type SleepStudyUpdate = Partial<SleepStudyInsert>;

type SleepStudyRow = {
  id: string;
  patient_id: string;
  patient_first_name: string | null;
  patient_last_name: string | null;
  purchase_order_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  device_serial: string | null;
  device_shipped_at: Date | null;
  device_delivered_at: Date | null;
  device_returned_at: Date | null;
  study_date: Date | null;
  results_received_at: Date | null;
  raw_results: Record<string, unknown> | null;
  ahi_score: string | null;
  spo2_nadir: string | null;
  odi: string | null;
  interpreted_by: string | null;
  interpreted_by_first_name: string | null;
  interpreted_by_last_name: string | null;
  interpreted_at: Date | null;
  interpretation: string | null;
  diagnosis_code: Record<string, unknown> | null;
  oa_indicated: boolean | null;
  cpap_indicated: boolean | null;
  status: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

const SLEEP_STUDY_SELECT_COLS = `
  s.id, s.patient_id, s.purchase_order_id, s.supplier_id, sup.name AS supplier_name,
  s.device_serial, s.device_shipped_at, s.device_delivered_at, s.device_returned_at,
  s.study_date, s.results_received_at, s.raw_results, s.ahi_score, s.spo2_nadir, s.odi,
  s.interpreted_by, s.interpreted_at, s.interpretation, s.diagnosis_code,
  s.oa_indicated, s.cpap_indicated, s.status, s.notes, s.metadata,
  s.created_at, s.updated_at,
  pi.first_name AS patient_first_name, pi.last_name AS patient_last_name,
  ii.first_name AS interpreted_by_first_name, ii.last_name AS interpreted_by_last_name`.trim();

const SLEEP_STUDY_JOIN = `
  FROM sleep_study s
  JOIN patient p ON s.patient_id = p.id
  JOIN identities pi ON p.identity_id = pi.id
  LEFT JOIN supplier sup ON s.supplier_id = sup.id
  LEFT JOIN practitioner ipr ON s.interpreted_by = ipr.id
  LEFT JOIN identities ii ON ipr.identity_id = ii.id`.trim();

function optNum(val: string | null): number | null {
  return val === null ? null : Number(val);
}

function serialize(row: SleepStudyRow): SleepStudy {
  return {
    id: row.id,
    patient_id: row.patient_id,
    patient_name: [row.patient_first_name, row.patient_last_name].filter(Boolean).join(" ").trim() || null,
    purchase_order_id: row.purchase_order_id,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    device_serial: row.device_serial,
    device_shipped_at: row.device_shipped_at ? isoDate(row.device_shipped_at) : null,
    device_delivered_at: row.device_delivered_at ? isoDate(row.device_delivered_at) : null,
    device_returned_at: row.device_returned_at ? isoDate(row.device_returned_at) : null,
    study_date: row.study_date ? isoDate(row.study_date) : null,
    results_received_at: row.results_received_at ? isoDate(row.results_received_at) : null,
    raw_results: row.raw_results,
    ahi_score: optNum(row.ahi_score),
    spo2_nadir: optNum(row.spo2_nadir),
    odi: optNum(row.odi),
    interpreted_by: row.interpreted_by,
    interpreted_by_name:
      [row.interpreted_by_first_name, row.interpreted_by_last_name].filter(Boolean).join(" ").trim() || null,
    interpreted_at: row.interpreted_at ? isoDate(row.interpreted_at) : null,
    interpretation: row.interpretation,
    diagnosis_code: row.diagnosis_code,
    oa_indicated: row.oa_indicated,
    cpap_indicated: row.cpap_indicated,
    status: row.status,
    notes: row.notes,
    metadata: row.metadata,
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

export async function getSleepStudiesPaginated(
  client: PoolClient,
  filters: GetSleepStudiesFilters,
  page: number,
  limit: number,
  sortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc"
): Promise<{ rows: SleepStudy[]; total: number }> {
  const allowed = ["created_at", "study_date", "status"];
  const col = allowed.includes(sortBy) ? sortBy : "created_at";
  const dir = sortOrder === "asc" ? "ASC" : "DESC";

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.patient_id?.trim()) {
    params.push(filters.patient_id.trim());
    conditions.push(`s.patient_id = $${params.length}`);
  }
  if (filters.status?.trim()) {
    params.push(filters.status.trim());
    conditions.push(`s.status = $${params.length}`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    conditions.push(`LOWER(pi.first_name || ' ' || pi.last_name) LIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count ${SLEEP_STUDY_JOIN} ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<SleepStudyRow>(
      `SELECT ${SLEEP_STUDY_SELECT_COLS}
       ${SLEEP_STUDY_JOIN}
       ${where}
       ORDER BY s.${col} ${dir}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: dataResult.rows.map(serialize), total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getSleepStudiesPaginated", err);
  }
}

export async function getSleepStudyById(client: PoolClient, id: string): Promise<SleepStudy | null> {
  try {
    const result = await client.query<SleepStudyRow>(
      `SELECT ${SLEEP_STUDY_SELECT_COLS} ${SLEEP_STUDY_JOIN} WHERE s.id = $1`,
      [id]
    );
    if (!result.rows[0]) return null;
    return serialize(result.rows[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getSleepStudyById", err);
  }
}

export async function insertSleepStudy(client: PoolClient, data: SleepStudyInsert): Promise<SleepStudy> {
  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO sleep_study (
         patient_id, purchase_order_id, supplier_id, device_serial,
         device_shipped_at, device_delivered_at, device_returned_at, study_date,
         results_received_at, raw_results, ahi_score, spo2_nadir, odi,
         interpreted_by, interpreted_at, interpretation, diagnosis_code,
         oa_indicated, cpap_indicated, status, notes, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING id`,
      [
        data.patient_id,
        data.purchase_order_id ?? null,
        data.supplier_id ?? null,
        data.device_serial ?? null,
        data.device_shipped_at ?? null,
        data.device_delivered_at ?? null,
        data.device_returned_at ?? null,
        data.study_date ?? null,
        data.results_received_at ?? null,
        data.raw_results ? JSON.stringify(data.raw_results) : null,
        data.ahi_score ?? null,
        data.spo2_nadir ?? null,
        data.odi ?? null,
        data.interpreted_by ?? null,
        data.interpreted_at ?? null,
        data.interpretation ?? null,
        data.diagnosis_code ? JSON.stringify(data.diagnosis_code) : null,
        data.oa_indicated ?? null,
        data.cpap_indicated ?? null,
        data.status ?? "ordered",
        data.notes ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
    const row = await getSleepStudyById(client, result.rows[0]!.id);
    if (!row) throw new DatabaseError("insertSleepStudy", new Error("Insert returned no rows"));
    return row;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertSleepStudy", err);
  }
}

const SLEEP_STUDY_UPDATE_FIELDS: (keyof SleepStudyUpdate)[] = [
  "purchase_order_id",
  "supplier_id",
  "device_serial",
  "device_shipped_at",
  "device_delivered_at",
  "device_returned_at",
  "study_date",
  "results_received_at",
  "raw_results",
  "ahi_score",
  "spo2_nadir",
  "odi",
  "interpreted_by",
  "interpreted_at",
  "interpretation",
  "diagnosis_code",
  "oa_indicated",
  "cpap_indicated",
  "status",
  "notes",
  "metadata",
];

const JSON_FIELDS = new Set(["raw_results", "diagnosis_code", "metadata"]);

export async function updateSleepStudy(
  client: PoolClient,
  id: string,
  data: SleepStudyUpdate
): Promise<SleepStudy | null> {
  const existing = await getSleepStudyById(client, id);
  if (!existing) return null;

  try {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of SLEEP_STUDY_UPDATE_FIELDS) {
      if (data[field] !== undefined) {
        const val = JSON_FIELDS.has(field) && data[field] != null ? JSON.stringify(data[field]) : (data[field] ?? null);
        params.push(val);
        sets.push(`${field} = $${idx++}`);
      }
    }
    if (sets.length === 1) return existing; // nothing to update

    params.push(id);
    await client.query(`UPDATE sleep_study SET ${sets.join(", ")} WHERE id = $${idx}`, params);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateSleepStudy", err);
  }

  return getSleepStudyById(client, id);
}

/**
 * Hard delete — no deleted_at column on this table (unlike patient). Admin-
 * only, enforced at the route (see routes/sleepStudy.ts). Does NOT take any
 * linked treatment_plan (OrthoApnea) rows down with it — sleep_study_id
 * there is ON DELETE SET NULL (migration 017), by product decision: deleting
 * a mistaken/test study shouldn't destroy a real OrthoApnea plan.
 */
export async function deleteSleepStudy(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`DELETE FROM sleep_study WHERE id = $1`, [id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("deleteSleepStudy", err);
  }
}
