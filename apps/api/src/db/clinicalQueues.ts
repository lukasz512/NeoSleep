/**
 * Where each sleep study and treatment plan stands in the care protocol (docs/clinical/protocolo-atencion),
 * computed in SQL so the doctor's lists can filter, count and sort by it.
 *
 * Treatment plan = the device order. Its stage follows the protocol's visits:
 *   scan (Cita 2, order not sent yet) → delivery (Cita 3, device at the lab) → control_1 (Cita 4, 2 weeks
 *   after delivery) → control_2 (Cita 5, 2 weeks later) → follow_up (1 / 3 / 6 months, then every 6) → done.
 * A visit counts as a control when it took place (not cancelled / no-show) on a day after the delivery.
 *
 * Sleep study: the next step it waits for, and whether it is the initial study or the control one
 * (a treatment plan for the patient existed before it was created).
 */

export const TREATMENT_STAGES = ["scan", "delivery", "control_1", "control_2", "follow_up", "done"] as const;
export type TreatmentStage = (typeof TREATMENT_STAGES)[number];

export const TREATMENT_QUEUES = ["action", "active", "follow_up", "done"] as const;
export type TreatmentQueue = (typeof TREATMENT_QUEUES)[number];

export const STUDY_STEPS = [
  "hand_sensor",
  "recording",
  "sensor_overdue",
  "awaiting_results",
  "to_interpret",
  "schedule_scan",
  "plan_started",
  "not_candidate",
  "review_discharge",
  "discharged",
  "cancelled",
] as const;
export type StudyStep = (typeof STUDY_STEPS)[number];

export const STUDY_QUEUES = ["action", "active", "done"] as const;
export type StudyQueue = (typeof STUDY_QUEUES)[number];

export type StudyPhase = "initial" | "control";

/** Days a patient keeps the home sensor (3 nights + slack) before it counts as not returned. */
export const SENSOR_RETURN_DAYS = 5;

export interface TreatmentProgress {
  stage: TreatmentStage;
  queue: TreatmentQueue;
  needs_action: boolean;
  /** The protocol's date for the next visit has passed and none is booked. */
  overdue: boolean;
  /** When the protocol expects the next visit; null before the order is sent and once done. */
  due_at: string | null;
  next_visit_at: string | null;
  delivered_at: string | null;
  /** Mandibular advance level the doctor recorded at the last control (metadata.advance_level). */
  advance_level: number | null;
  /** AHI of the study the plan came from, and of the latest later study (the control). */
  ahi_baseline: number | null;
  ahi_latest: number | null;
}

export interface StudyProgress {
  phase: StudyPhase;
  next_step: StudyStep;
  queue: StudyQueue;
  needs_action: boolean;
}

export function isTreatmentQueue(v: string | undefined): v is TreatmentQueue {
  return !!v && (TREATMENT_QUEUES as readonly string[]).includes(v);
}

export function isStudyQueue(v: string | undefined): v is StudyQueue {
  return !!v && (STUDY_QUEUES as readonly string[]).includes(v);
}

// --- Treatment plan ---------------------------------------------------------

/** Joined after the plan's own FROM/JOINs (needs aliases t, p, ord). */
export const TREATMENT_PROGRESS_JOIN = `
  LEFT JOIN sleep_study bs ON bs.id = t.sleep_study_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(t.appliance_delivered_at, CASE WHEN t.status = 'completed' THEN t.updated_at END) AS delivered_at
  ) dlv ON true
  LEFT JOIN LATERAL (
    SELECT
      min(a.start_at) FILTER (WHERE a.status = 'scheduled' AND a.start_at >= now()) AS next_visit_at,
      count(*) FILTER (WHERE a.status IN ('scheduled', 'completed') AND a.start_at < now()
                         AND dlv.delivered_at IS NOT NULL AND a.start_at::date > dlv.delivered_at::date)::int AS controls_done,
      max(a.start_at) FILTER (WHERE a.status IN ('scheduled', 'completed') AND a.start_at < now()
                         AND dlv.delivered_at IS NOT NULL AND a.start_at::date > dlv.delivered_at::date) AS last_control_at
      FROM appointment a
     WHERE a.patient_id = t.patient_id AND a.deleted_at IS NULL
  ) vis ON true
  LEFT JOIN LATERAL (
    SELECT s2.ahi_score
      FROM sleep_study s2
     WHERE s2.patient_id = t.patient_id AND s2.ahi_score IS NOT NULL
       AND s2.id IS DISTINCT FROM t.sleep_study_id AND s2.created_at > t.created_at
     ORDER BY s2.created_at DESC
     LIMIT 1
  ) lat ON true`.trim();

export const TREATMENT_PROGRESS_COLS = `
  p.status AS patient_status,
  COALESCE(t.metadata->'orthoapneaDraft', 'null'::jsonb) NOT IN ('null'::jsonb, 'false'::jsonb) AS is_draft,
  dlv.delivered_at, vis.next_visit_at, vis.controls_done, vis.last_control_at,
  bs.ahi_score AS ahi_baseline, lat.ahi_score AS ahi_latest,
  CASE WHEN jsonb_typeof(t.metadata->'advance_level') = 'number' THEN (t.metadata->>'advance_level')::int END AS advance_level`.trim();

/**
 * Wraps a base SELECT (plan columns + TREATMENT_PROGRESS_COLS) into CTEs ending in `queued`,
 * which adds stage, due_at, needs_action, overdue and queue.
 */
export function treatmentProgressCte(baseSelect: string): string {
  return `WITH base AS (${baseSelect}),
  staged AS (
    SELECT base.*,
      CASE
        WHEN base.status = 'cancelled' OR base.patient_status = 'discharged' THEN 'done'
        WHEN base.is_draft THEN 'scan'
        WHEN base.delivered_at IS NULL THEN 'delivery'
        WHEN base.controls_done = 0 THEN 'control_1'
        WHEN base.controls_done = 1 THEN 'control_2'
        ELSE 'follow_up'
      END AS stage
      FROM base
  ),
  dated AS (
    SELECT staged.*,
      CASE staged.stage
        WHEN 'delivery' THEN COALESCE(staged.order_sent_at, staged.appliance_ordered_at, staged.created_at) + interval '15 days'
        WHEN 'control_1' THEN staged.delivered_at + interval '14 days'
        WHEN 'control_2' THEN staged.last_control_at + interval '14 days'
        WHEN 'follow_up' THEN COALESCE(
          (SELECT min(m) FROM unnest(ARRAY[
              staged.delivered_at + interval '1 month',
              staged.delivered_at + interval '3 months',
              staged.delivered_at + interval '6 months']) AS m
            WHERE m > staged.last_control_at + interval '7 days'),
          staged.last_control_at + interval '6 months')
      END AS due_at
      FROM staged
  ),
  flagged AS (
    SELECT dated.*,
      CASE
        WHEN dated.stage = 'done' THEN false
        WHEN dated.stage = 'scan' THEN true
        WHEN dated.order_sync_status = 'failed' THEN true
        WHEN dated.next_visit_at IS NOT NULL THEN false
        ELSE dated.due_at IS NULL OR dated.due_at <= now() + interval '14 days'
      END AS needs_action,
      COALESCE(dated.stage <> 'done' AND dated.next_visit_at IS NULL AND dated.due_at < now(), false) AS overdue
      FROM dated
  ),
  queued AS (
    SELECT flagged.*,
      CASE
        WHEN flagged.stage = 'done' THEN 'done'
        WHEN flagged.needs_action THEN 'action'
        WHEN flagged.stage = 'follow_up' THEN 'follow_up'
        ELSE 'active'
      END AS queue
      FROM flagged
  )`;
}

/** "What needs me first": action rows, overdue first, then the nearest visit or due date. */
export const PRIORITY_ORDER = `(queue = 'action') DESC, overdue DESC, COALESCE(next_visit_at, due_at) ASC NULLS LAST, id`;

// --- Sleep study ------------------------------------------------------------

/** Needs aliases s, p. */
export const STUDY_PROGRESS_COLS = `
  p.status AS patient_status,
  EXISTS (SELECT 1 FROM treatment_plan tp WHERE tp.sleep_study_id = s.id AND tp.deleted_at IS NULL) AS has_plan,
  CASE WHEN EXISTS (SELECT 1 FROM treatment_plan tp WHERE tp.patient_id = s.patient_id AND tp.deleted_at IS NULL
                      AND tp.created_at < s.created_at) THEN 'control' ELSE 'initial' END AS phase`.trim();

export function studyProgressCte(baseSelect: string): string {
  return `WITH base AS (${baseSelect}),
  stepped AS (
    SELECT base.*,
      CASE
        WHEN base.status = 'cancelled' THEN 'cancelled'
        WHEN base.status IN ('ordered', 'device_shipped') THEN 'hand_sensor'
        WHEN base.status = 'device_delivered'
             AND base.device_delivered_at < now() - interval '${SENSOR_RETURN_DAYS} days' THEN 'sensor_overdue'
        WHEN base.status = 'device_delivered' THEN 'recording'
        WHEN base.status = 'study_complete' THEN 'awaiting_results'
        WHEN base.status = 'results_received' THEN 'to_interpret'
        WHEN base.phase = 'control' AND base.patient_status = 'discharged' THEN 'discharged'
        WHEN base.phase = 'control' THEN 'review_discharge'
        WHEN base.has_plan THEN 'plan_started'
        WHEN base.oa_indicated IS FALSE THEN 'not_candidate'
        ELSE 'schedule_scan'
      END AS next_step
      FROM base
  ),
  queued AS (
    SELECT stepped.*,
      stepped.next_step IN ('sensor_overdue', 'to_interpret', 'schedule_scan', 'review_discharge') AS needs_action,
      CASE
        WHEN stepped.next_step IN ('cancelled', 'plan_started', 'not_candidate', 'discharged') THEN 'done'
        WHEN stepped.next_step IN ('sensor_overdue', 'to_interpret', 'schedule_scan', 'review_discharge') THEN 'action'
        ELSE 'active'
      END AS queue
      FROM stepped
  )`;
}

/** Action rows first, the longest waiting first. */
export const STUDY_PRIORITY_ORDER = `(queue = 'action') DESC, COALESCE(results_received_at, device_delivered_at, created_at) ASC, id`;
