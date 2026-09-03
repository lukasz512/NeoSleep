import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import { isoDate } from "../routes/utils.js";

export const TREATMENT_PLAN_TYPES = [
  "cpap",
  "apap",
  "dental_appliance",
  "positional",
  "lifestyle",
  "watchful_waiting",
] as const;
export type TreatmentPlanType = (typeof TREATMENT_PLAN_TYPES)[number];

export const TREATMENT_PLAN_STATUSES = [
  "initiated",
  "patient_notified",
  "in_progress",
  "completed",
  "cancelled",
  "on_hold",
] as const;
export type TreatmentPlanStatus = (typeof TREATMENT_PLAN_STATUSES)[number];

export interface TreatmentPlan {
  id: string;
  patient_id: string;
  patient_name: string | null;
  /** Nullable — set to NULL if the originating sleep_study is later deleted (ON DELETE SET NULL, migration 017); the plan itself survives. */
  sleep_study_id: string | null;
  type: string;
  device_product_id: string | null;
  device_purchase_order_id: string | null;
  dentist_id: string | null;
  dentist_name: string | null;
  dentist_notified_at: string | null;
  dentist_accepted_at: string | null;
  appointment_at: string | null;
  scan_supplier_id: string | null;
  scan_supplier_name: string | null;
  scan_ordered_at: string | null;
  scan_received_at: string | null;
  scan_file_url: string | null;
  appliance_supplier_id: string | null;
  appliance_supplier_name: string | null;
  appliance_ordered_at: string | null;
  appliance_delivered_at: string | null;
  recommended_by: string | null;
  notes: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface GetTreatmentPlansFilters {
  patient_id?: string;
  type?: string;
  status?: string;
  /** Matches against the patient's name — the sidebar cross-patient list's only searchable field. */
  search?: string;
}

export interface TreatmentPlanInsert {
  patient_id: string;
  sleep_study_id: string;
  type: string;
  device_product_id?: string;
  device_purchase_order_id?: string;
  dentist_id?: string;
  dentist_notified_at?: string;
  dentist_accepted_at?: string;
  appointment_at?: string;
  scan_supplier_id?: string;
  scan_ordered_at?: string;
  scan_received_at?: string;
  scan_file_url?: string;
  appliance_supplier_id?: string;
  appliance_ordered_at?: string;
  appliance_delivered_at?: string;
  recommended_by?: string;
  notes?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export type TreatmentPlanUpdate = Partial<Omit<TreatmentPlanInsert, "patient_id" | "sleep_study_id">>;

type TreatmentPlanRow = {
  id: string;
  patient_id: string;
  patient_first_name: string | null;
  patient_last_name: string | null;
  sleep_study_id: string | null;
  type: string;
  device_product_id: string | null;
  device_purchase_order_id: string | null;
  dentist_id: string | null;
  dentist_first_name: string | null;
  dentist_last_name: string | null;
  dentist_notified_at: Date | null;
  dentist_accepted_at: Date | null;
  appointment_at: Date | null;
  scan_supplier_id: string | null;
  scan_supplier_name: string | null;
  scan_ordered_at: Date | null;
  scan_received_at: Date | null;
  scan_file_url: string | null;
  appliance_supplier_id: string | null;
  appliance_supplier_name: string | null;
  appliance_ordered_at: Date | null;
  appliance_delivered_at: Date | null;
  recommended_by: string | null;
  notes: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

const TREATMENT_PLAN_SELECT_COLS = `
  t.id, t.patient_id, t.sleep_study_id, t.type,
  t.device_product_id, t.device_purchase_order_id,
  t.dentist_id, t.dentist_notified_at, t.dentist_accepted_at, t.appointment_at,
  t.scan_supplier_id, scansup.name AS scan_supplier_name,
  t.scan_ordered_at, t.scan_received_at, t.scan_file_url,
  t.appliance_supplier_id, applsup.name AS appliance_supplier_name,
  t.appliance_ordered_at, t.appliance_delivered_at,
  t.recommended_by, t.notes, t.status, t.metadata, t.created_at, t.updated_at,
  pi.first_name AS patient_first_name, pi.last_name AS patient_last_name,
  di.first_name AS dentist_first_name, di.last_name AS dentist_last_name`.trim();

const TREATMENT_PLAN_JOIN = `
  FROM treatment_plan t
  JOIN patient p ON t.patient_id = p.id
  JOIN identities pi ON p.identity_id = pi.id
  LEFT JOIN practitioner den ON t.dentist_id = den.id
  LEFT JOIN identities di ON den.identity_id = di.id
  LEFT JOIN supplier scansup ON t.scan_supplier_id = scansup.id
  LEFT JOIN supplier applsup ON t.appliance_supplier_id = applsup.id`.trim();

function serialize(row: TreatmentPlanRow): TreatmentPlan {
  return {
    id: row.id,
    patient_id: row.patient_id,
    patient_name: [row.patient_first_name, row.patient_last_name].filter(Boolean).join(" ").trim() || null,
    sleep_study_id: row.sleep_study_id,
    type: row.type,
    device_product_id: row.device_product_id,
    device_purchase_order_id: row.device_purchase_order_id,
    dentist_id: row.dentist_id,
    dentist_name: [row.dentist_first_name, row.dentist_last_name].filter(Boolean).join(" ").trim() || null,
    dentist_notified_at: row.dentist_notified_at ? isoDate(row.dentist_notified_at) : null,
    dentist_accepted_at: row.dentist_accepted_at ? isoDate(row.dentist_accepted_at) : null,
    appointment_at: row.appointment_at ? isoDate(row.appointment_at) : null,
    scan_supplier_id: row.scan_supplier_id,
    scan_supplier_name: row.scan_supplier_name,
    scan_ordered_at: row.scan_ordered_at ? isoDate(row.scan_ordered_at) : null,
    scan_received_at: row.scan_received_at ? isoDate(row.scan_received_at) : null,
    scan_file_url: row.scan_file_url,
    appliance_supplier_id: row.appliance_supplier_id,
    appliance_supplier_name: row.appliance_supplier_name,
    appliance_ordered_at: row.appliance_ordered_at ? isoDate(row.appliance_ordered_at) : null,
    appliance_delivered_at: row.appliance_delivered_at ? isoDate(row.appliance_delivered_at) : null,
    recommended_by: row.recommended_by,
    notes: row.notes,
    status: row.status,
    metadata: row.metadata,
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

export async function getTreatmentPlansPaginated(
  client: PoolClient,
  filters: GetTreatmentPlansFilters,
  page: number,
  limit: number,
  sortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc"
): Promise<{ rows: TreatmentPlan[]; total: number }> {
  const allowed = ["created_at", "status", "type"];
  const col = allowed.includes(sortBy) ? sortBy : "created_at";
  const dir = sortOrder === "asc" ? "ASC" : "DESC";

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.patient_id?.trim()) {
    params.push(filters.patient_id.trim());
    conditions.push(`t.patient_id = $${params.length}`);
  }
  if (filters.type?.trim()) {
    params.push(filters.type.trim());
    conditions.push(`t.type = $${params.length}`);
  }
  if (filters.status?.trim()) {
    params.push(filters.status.trim());
    conditions.push(`t.status = $${params.length}`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    conditions.push(`LOWER(pi.first_name || ' ' || pi.last_name) LIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count ${TREATMENT_PLAN_JOIN} ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<TreatmentPlanRow>(
      `SELECT ${TREATMENT_PLAN_SELECT_COLS}
       ${TREATMENT_PLAN_JOIN}
       ${where}
       ORDER BY t.${col} ${dir}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: dataResult.rows.map(serialize), total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getTreatmentPlansPaginated", err);
  }
}

export async function getTreatmentPlanById(client: PoolClient, id: string): Promise<TreatmentPlan | null> {
  try {
    const result = await client.query<TreatmentPlanRow>(
      `SELECT ${TREATMENT_PLAN_SELECT_COLS} ${TREATMENT_PLAN_JOIN} WHERE t.id = $1`,
      [id]
    );
    if (!result.rows[0]) return null;
    return serialize(result.rows[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getTreatmentPlanById", err);
  }
}

export async function insertTreatmentPlan(client: PoolClient, data: TreatmentPlanInsert): Promise<TreatmentPlan> {
  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO treatment_plan (
         patient_id, sleep_study_id, type, device_product_id, device_purchase_order_id,
         dentist_id, dentist_notified_at, dentist_accepted_at, appointment_at,
         scan_supplier_id, scan_ordered_at, scan_received_at, scan_file_url,
         appliance_supplier_id, appliance_ordered_at, appliance_delivered_at,
         recommended_by, notes, status, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [
        data.patient_id,
        data.sleep_study_id,
        data.type,
        data.device_product_id ?? null,
        data.device_purchase_order_id ?? null,
        data.dentist_id ?? null,
        data.dentist_notified_at ?? null,
        data.dentist_accepted_at ?? null,
        data.appointment_at ?? null,
        data.scan_supplier_id ?? null,
        data.scan_ordered_at ?? null,
        data.scan_received_at ?? null,
        data.scan_file_url ?? null,
        data.appliance_supplier_id ?? null,
        data.appliance_ordered_at ?? null,
        data.appliance_delivered_at ?? null,
        data.recommended_by ?? null,
        data.notes ?? null,
        data.status ?? "initiated",
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
    const row = await getTreatmentPlanById(client, result.rows[0]!.id);
    if (!row) throw new DatabaseError("insertTreatmentPlan", new Error("Insert returned no rows"));
    return row;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertTreatmentPlan", err);
  }
}

const TREATMENT_PLAN_UPDATE_FIELDS: (keyof TreatmentPlanUpdate)[] = [
  "type",
  "device_product_id",
  "device_purchase_order_id",
  "dentist_id",
  "dentist_notified_at",
  "dentist_accepted_at",
  "appointment_at",
  "scan_supplier_id",
  "scan_ordered_at",
  "scan_received_at",
  "scan_file_url",
  "appliance_supplier_id",
  "appliance_ordered_at",
  "appliance_delivered_at",
  "recommended_by",
  "notes",
  "status",
  "metadata",
];

export async function updateTreatmentPlan(
  client: PoolClient,
  id: string,
  data: TreatmentPlanUpdate
): Promise<TreatmentPlan | null> {
  const existing = await getTreatmentPlanById(client, id);
  if (!existing) return null;

  try {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of TREATMENT_PLAN_UPDATE_FIELDS) {
      if (data[field] !== undefined) {
        const val = field === "metadata" && data[field] != null ? JSON.stringify(data[field]) : (data[field] ?? null);
        params.push(val);
        sets.push(`${field} = $${idx++}`);
      }
    }
    if (sets.length === 1) return existing;

    params.push(id);
    await client.query(`UPDATE treatment_plan SET ${sets.join(", ")} WHERE id = $${idx}`, params);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateTreatmentPlan", err);
  }

  return getTreatmentPlanById(client, id);
}
