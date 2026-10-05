import type { PoolClient } from "pg";
import { patientScopeCondition, type PatientScope } from "./patientScope.js";
import { AppError, DatabaseError } from "../errors.js";
import { isoDate } from "../routes/utils.js";
import { formatOptionalDisplayName } from "../utils/personName.js";
import {
  PRIORITY_ORDER,
  TREATMENT_PROGRESS_COLS,
  TREATMENT_PROGRESS_JOIN,
  treatmentProgressCte,
  type TreatmentProgress,
  type TreatmentQueue,
} from "./clinicalQueues.js";

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
  /** Name parts for the PWA's short list name (first given name + first surname). */
  patient_first_name: string | null;
  patient_last_name: string | null;
  /** Nullable — set to NULL if the originating sleep_study is later deleted (ON DELETE SET NULL, migration 017); the plan itself survives. */
  sleep_study_id: string | null;
  type: string;
  device_product_id: string | null;
  device_purchase_order_id: string | null;
  dentist_id: string | null;
  dentist_name: string | null;
  dentist_first_name: string | null;
  dentist_last_name: string | null;
  /** Dentist's primary_specialty lookup key (NEO-57) */
  dentist_specialty: string | null;
  dentist_specialties: string[];
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
  /** NEO-217: the partner order behind this plan (partner_link, migration 018) — null until it was ever sent. Partner-neutral on purpose. */
  order_number: string | null;
  order_sync_status: "pending" | "synced" | "failed" | null;
  order_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GetTreatmentPlansFilters {
  patient_id?: string;
  type?: string;
  status?: string;
  /** Matches against the patient's name — the sidebar cross-patient list's only searchable field. */
  search?: string;
  /** Viewer's patient access (CORE-104, db/patientScope.ts); undefined = unrestricted. */
  patientScope?: PatientScope;
  /** The doctor's list chips (clinicalQueues.ts); set → rows sorted by priority unless another column is asked for. */
  queue?: TreatmentQueue;
}

/** A list row: the plan plus where it stands in the care protocol. */
export type TreatmentPlanListItem = TreatmentPlan & { progress: TreatmentProgress };

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
  patient_salutation: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  sleep_study_id: string | null;
  type: string;
  device_product_id: string | null;
  device_purchase_order_id: string | null;
  dentist_id: string | null;
  dentist_salutation: string | null;
  dentist_first_name: string | null;
  dentist_last_name: string | null;
  dentist_specialty: string | null;
  dentist_specialties: string[] | null;
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
  order_number: string | null;
  order_sync_status: "pending" | "synced" | "failed" | null;
  order_sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type TreatmentPlanProgressRow = TreatmentPlanRow & {
  stage: TreatmentProgress["stage"];
  queue: TreatmentQueue;
  needs_action: boolean;
  overdue: boolean;
  due_at: Date | null;
  next_visit_at: Date | null;
  delivered_at: Date | null;
  advance_level: number | null;
  ahi_baseline: string | null;
  ahi_latest: string | null;
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
  pi.title AS patient_salutation, pi.first_name AS patient_first_name, pi.last_name AS patient_last_name,
  di.title AS dentist_salutation, di.first_name AS dentist_first_name, di.last_name AS dentist_last_name,
  den.primary_specialty AS dentist_specialty, den.specialties AS dentist_specialties,
  ord.external_id AS order_number, ord.sync_status AS order_sync_status, ord.created_at AS order_sent_at`.trim();

const TREATMENT_PLAN_JOIN = `
  FROM treatment_plan t
  JOIN patient p ON t.patient_id = p.id
  JOIN identities pi ON p.identity_id = pi.id
  LEFT JOIN practitioner den ON t.dentist_id = den.id
  LEFT JOIN identities di ON den.identity_id = di.id
  LEFT JOIN supplier scansup ON t.scan_supplier_id = scansup.id
  LEFT JOIN supplier applsup ON t.appliance_supplier_id = applsup.id
  LEFT JOIN LATERAL (
    SELECT pl.external_id, pl.sync_status, pl.created_at
      FROM partner_link pl
     WHERE pl.entity_type = 'treatment_plan' AND pl.entity_id = t.id
     ORDER BY pl.updated_at DESC
     LIMIT 1
  ) ord ON true`.trim();

function serialize(row: TreatmentPlanRow): TreatmentPlan {
  return {
    id: row.id,
    patient_id: row.patient_id,
    patient_first_name: row.patient_first_name,
    patient_last_name: row.patient_last_name,
    dentist_first_name: row.dentist_first_name,
    dentist_last_name: row.dentist_last_name,
    patient_name: formatOptionalDisplayName({
      salutation: row.patient_salutation,
      first_name: row.patient_first_name,
      last_name: row.patient_last_name,
    }),
    sleep_study_id: row.sleep_study_id,
    type: row.type,
    device_product_id: row.device_product_id,
    device_purchase_order_id: row.device_purchase_order_id,
    dentist_id: row.dentist_id,
    dentist_name: formatOptionalDisplayName({
      salutation: row.dentist_salutation,
      first_name: row.dentist_first_name,
      last_name: row.dentist_last_name,
    }),
    dentist_specialty: row.dentist_specialty,
    dentist_specialties: row.dentist_specialties ?? [],
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
    order_number: row.order_number,
    order_sync_status: row.order_sync_status,
    order_sent_at: row.order_sent_at ? isoDate(row.order_sent_at) : null,
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

function optNum(val: string | null): number | null {
  return val === null ? null : Number(val);
}

function serializeListItem(row: TreatmentPlanProgressRow): TreatmentPlanListItem {
  return {
    ...serialize(row),
    progress: {
      stage: row.stage,
      queue: row.queue,
      needs_action: row.needs_action,
      overdue: row.overdue,
      due_at: row.due_at ? isoDate(row.due_at) : null,
      next_visit_at: row.next_visit_at ? isoDate(row.next_visit_at) : null,
      delivered_at: row.delivered_at ? isoDate(row.delivered_at) : null,
      advance_level: row.advance_level,
      ahi_baseline: optNum(row.ahi_baseline),
      ahi_latest: optNum(row.ahi_latest),
    },
  };
}

/** WHERE for the plan list and its queue counts: every filter but the queue itself. */
function listWhere(filters: GetTreatmentPlansFilters, params: unknown[]): string {
  const conditions: string[] = ["t.deleted_at IS NULL"];
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
  const scoped = patientScopeCondition(filters.patientScope, params, "t.patient_id");
  if (scoped) conditions.push(scoped);
  return `WHERE ${conditions.join(" AND ")}`;
}

function progressCte(where: string): string {
  return treatmentProgressCte(
    `SELECT ${TREATMENT_PLAN_SELECT_COLS}, ${TREATMENT_PROGRESS_COLS} ${TREATMENT_PLAN_JOIN} ${TREATMENT_PROGRESS_JOIN} ${where}`
  );
}

export async function getTreatmentPlansPaginated(
  client: PoolClient,
  filters: GetTreatmentPlansFilters,
  page: number,
  limit: number,
  sortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc"
): Promise<{ rows: TreatmentPlanListItem[]; total: number }> {
  const allowed = ["created_at", "status", "type"];
  const col = allowed.includes(sortBy) ? sortBy : "created_at";
  const dir = sortOrder === "asc" ? "ASC" : "DESC";
  // The list's untouched default (created_at) gives way to priority once a queue chip is picked.
  const order = filters.queue && col === "created_at" ? PRIORITY_ORDER : `${col} ${dir}, id`;

  const params: unknown[] = [];
  const cte = progressCte(listWhere(filters, params));
  let queueWhere = "";
  if (filters.queue) {
    params.push(filters.queue);
    queueWhere = `WHERE queue = $${params.length}`;
  }

  try {
    const countResult = await client.query<{ count: string }>(
      `${cte} SELECT COUNT(*) AS count FROM queued ${queueWhere}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<TreatmentPlanProgressRow>(
      `${cte} SELECT * FROM queued ${queueWhere}
       ORDER BY ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows: dataResult.rows.map(serializeListItem), total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getTreatmentPlansPaginated", err);
  }
}

/** How many plans sit in each queue chip, under the same filters (search, scope) as the list. */
export async function getTreatmentPlanQueueCounts(
  client: PoolClient,
  filters: Omit<GetTreatmentPlansFilters, "queue">
): Promise<Record<TreatmentQueue, number>> {
  const params: unknown[] = [];
  const cte = progressCte(listWhere(filters, params));
  try {
    const { rows } = await client.query<{ queue: TreatmentQueue; count: string }>(
      `${cte} SELECT queue, COUNT(*) AS count FROM queued GROUP BY queue`,
      params
    );
    const counts: Record<TreatmentQueue, number> = { action: 0, active: 0, follow_up: 0, done: 0 };
    for (const r of rows) counts[r.queue] = parseInt(r.count, 10);
    return counts;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getTreatmentPlanQueueCounts", err);
  }
}

export async function getTreatmentPlanById(client: PoolClient, id: string): Promise<TreatmentPlan | null> {
  try {
    const result = await client.query<TreatmentPlanRow>(
      `SELECT ${TREATMENT_PLAN_SELECT_COLS} ${TREATMENT_PLAN_JOIN} WHERE t.id = $1 AND t.deleted_at IS NULL`,
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

/**
 * Sets (or with null removes) metadata.advance_level, leaving the rest of metadata alone.
 * Leaves updated_at untouched: for a plan marked completed without a delivery date,
 * updated_at stands in for the delivery (clinicalQueues.ts), and a level change is not one.
 */
export async function setTreatmentPlanAdvanceLevel(client: PoolClient, id: string, level: number | null): Promise<TreatmentPlan> {
  try {
    await client.query(
      `UPDATE treatment_plan
          SET metadata = CASE WHEN $2::int IS NULL THEN COALESCE(metadata, '{}'::jsonb) - 'advance_level'
                              ELSE jsonb_set(COALESCE(metadata, '{}'::jsonb), '{advance_level}', to_jsonb($2::int)) END
        WHERE id = $1 AND deleted_at IS NULL`,
      [id, level]
    );
  } catch (err) {
    throw new DatabaseError("setTreatmentPlanAdvanceLevel", err);
  }
  const plan = await getTreatmentPlanById(client, id);
  if (!plan) throw new DatabaseError("setTreatmentPlanAdvanceLevel", new Error(`treatment_plan ${id} vanished`));
  return plan;
}

/**
 * Soft-deletes a treatment_plan by setting deleted_at (migration 019) — same
 * convention as softDeletePatient (db/patient.ts). Used to let an admin hide
 * a failed/abandoned OrthoApnea order from the patient's list without
 * destroying the local record or its partner_transaction audit trail
 * (partner_link/partner_transaction, migration 018, are keyed by
 * treatment_plan_id and are left untouched — the history stays queryable
 * even after the plan itself is hidden).
 */
export async function softDeleteTreatmentPlan(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE treatment_plan SET deleted_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("softDeleteTreatmentPlan", err);
  }
}

/**
 * Reverses softDeleteTreatmentPlan — e.g. a plan hidden as "abandoned" turns out
 * to have gone through after all (order completed directly with the partner)
 * and needs to become the record of that order rather than starting a duplicate.
 */
export async function restoreTreatmentPlan(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE treatment_plan SET deleted_at = NULL WHERE id = $1`, [id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("restoreTreatmentPlan", err);
  }
}

/** NEO-223: the latest device order of each patient — just the fields the PWA's deviceOrderState() reads. */
export interface PatientDeviceOrder {
  status: string;
  metadata: { orthoapneaDraft: true } | null;
  order_sync_status: "pending" | "synced" | "failed" | null;
  appliance_delivered_at: string | null;
}

export async function getLatestDeviceOrderByPatient(
  client: PoolClient,
  patientIds: string[],
): Promise<Map<string, PatientDeviceOrder>> {
  const byPatient = new Map<string, PatientDeviceOrder>();
  if (patientIds.length === 0) return byPatient;
  try {
    const result = await client.query<{
      patient_id: string;
      status: string;
      is_draft: boolean;
      order_sync_status: PatientDeviceOrder["order_sync_status"];
      appliance_delivered_at: Date | null;
    }>(
      `SELECT DISTINCT ON (t.patient_id)
              t.patient_id, t.status,
              (COALESCE(t.metadata, '{}'::jsonb) ? 'orthoapneaDraft') AS is_draft,
              ord.sync_status AS order_sync_status, t.appliance_delivered_at
         FROM treatment_plan t
         LEFT JOIN LATERAL (
           SELECT pl.sync_status
             FROM partner_link pl
            WHERE pl.entity_type = 'treatment_plan' AND pl.entity_id = t.id
            ORDER BY pl.updated_at DESC
            LIMIT 1
         ) ord ON true
        WHERE t.deleted_at IS NULL AND t.patient_id = ANY($1::uuid[])
        ORDER BY t.patient_id, t.created_at DESC`,
      [patientIds],
    );
    for (const row of result.rows) {
      byPatient.set(row.patient_id, {
        status: row.status,
        metadata: row.is_draft ? { orthoapneaDraft: true } : null,
        order_sync_status: row.order_sync_status,
        appliance_delivered_at: row.appliance_delivered_at ? isoDate(row.appliance_delivered_at) : null,
      });
    }
    return byPatient;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getLatestDeviceOrderByPatient", err);
  }
}

/**
 * NEO-223: whether the patient already has an open plan of this type — not deleted, not
 * completed/cancelled, no appliance delivered. Drafts count (the clinic continues that one).
 */
export async function hasActiveTreatmentPlan(client: PoolClient, patientId: string, type: string): Promise<boolean> {
  try {
    const result = await client.query(
      `SELECT 1 FROM treatment_plan
        WHERE patient_id = $1 AND type = $2 AND deleted_at IS NULL
          AND status NOT IN ('completed', 'cancelled') AND appliance_delivered_at IS NULL
        LIMIT 1`,
      [patientId, type],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("hasActiveTreatmentPlan", err);
  }
}
