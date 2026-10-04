import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import { formatOptionalDisplayName } from "../utils/personName.js";
import { careTeamCondition } from "./careTeam.js";

/**
 * Doctor Panel "Needs your action" queue (NEO-233) — one row per thing waiting on the doctor,
 * across their own patients only (primary doctor or care team, CORE-104 / CORE-132). Order = kind, then oldest first.
 */
export const DOCTOR_ACTION_KINDS = ["results_to_interpret", "cannot_attend", "plan_not_notified", "consent_missing"] as const;
export type DoctorActionKind = (typeof DOCTOR_ACTION_KINDS)[number];

export interface DoctorActionItem {
  kind: DoctorActionKind;
  patient_id: string;
  patient_name: string | null;
  /** The record to act on: sleep study / appointment / treatment plan id, or the consent's template key. */
  ref_id: string;
  /** When it started waiting (results received, appointment start, plan created); null for a missing consent. */
  at: string | null;
}

interface DoctorActionRow {
  kind: DoctorActionKind;
  patient_id: string;
  patient_salutation: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  ref_id: string;
  at: Date | null;
}

export async function listDoctorActions(client: PoolClient, practitionerId: string, consentKeys: string[]): Promise<DoctorActionItem[]> {
  try {
    const { rows } = await client.query<DoctorActionRow>(
      `WITH mine AS (
         SELECT p.id, p.status, pi.title AS patient_salutation, pi.first_name AS patient_first_name, pi.last_name AS patient_last_name
           FROM patient p
           JOIN identities pi ON pi.id = p.identity_id
          WHERE ${careTeamCondition("p", "$1")} AND p.deleted_at IS NULL
       ),
       items AS (
         SELECT 1 AS ord, 'results_to_interpret' AS kind, m.id AS patient_id, s.id::text AS ref_id,
                COALESCE(s.results_received_at, s.updated_at) AS at
           FROM sleep_study s JOIN mine m ON m.id = s.patient_id
          WHERE s.status = 'results_received'
         UNION ALL
         SELECT 2, 'cannot_attend', m.id, a.id::text, a.start_at
           FROM appointment a JOIN mine m ON m.id = a.patient_id
          WHERE a.deleted_at IS NULL AND a.status = 'scheduled'
            AND a.patient_response = 'cannot_attend' AND a.start_at >= now()
         UNION ALL
         SELECT 3, 'plan_not_notified', m.id, t.id::text, t.created_at
           FROM treatment_plan t JOIN mine m ON m.id = t.patient_id
          WHERE t.status = 'initiated' AND t.deleted_at IS NULL
         UNION ALL
         -- Same "signed" rule as the patient checklist: a non-withdrawn consent, or a file attached to that item.
         SELECT 4, 'consent_missing', m.id, k.key, NULL::timestamptz
           FROM mine m CROSS JOIN unnest($2::text[]) AS k(key)
          WHERE m.status <> 'discharged'
            AND NOT EXISTS (SELECT 1 FROM consent c
                             WHERE c.entity_type = 'patient' AND c.entity_id = m.id
                               AND c.purpose = k.key AND c.withdrawn_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM file_attachment f
                             WHERE f.entity_type = 'patient' AND f.entity_id = m.id
                               AND f.metadata->>'checklist_item' = k.key)
       )
       SELECT i.kind, i.patient_id, i.ref_id, i.at, m.patient_salutation, m.patient_first_name, m.patient_last_name
         FROM items i JOIN mine m ON m.id = i.patient_id
        ORDER BY i.ord, i.at NULLS LAST, m.patient_last_name, i.patient_id`,
      [practitionerId, consentKeys]
    );
    return rows.map((row) => ({
      kind: row.kind,
      patient_id: row.patient_id,
      patient_name: formatOptionalDisplayName({
        salutation: row.patient_salutation,
        first_name: row.patient_first_name,
        last_name: row.patient_last_name,
      }),
      ref_id: row.ref_id,
      at: row.at ? row.at.toISOString() : null,
    }));
  } catch (err) {
    throw new DatabaseError("listDoctorActions", err);
  }
}

/**
 * Doctor Panel v2 (NEO-233): where each of the doctor's own active patients stands. One stage per
 * patient, the furthest one reached: treatment > plan > results > study > intake (nothing yet).
 */
export const DOCTOR_PATIENT_STAGES = ["intake", "study", "results", "plan", "treatment"] as const;
export type DoctorPatientStage = (typeof DOCTOR_PATIENT_STAGES)[number];

export interface DoctorPanelPatient {
  id: string;
  name: string | null;
  stage: DoctorPatientStage;
  has_phone: boolean;
  has_email: boolean;
}

interface DoctorPanelPatientRow {
  id: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  stage: DoctorPatientStage;
  has_phone: boolean;
  has_email: boolean;
}

/** The doctor's own non-discharged patients with their stage and whether a phone/email is on file. */
export async function listDoctorPanelPatients(client: PoolClient, practitionerId: string): Promise<DoctorPanelPatient[]> {
  try {
    const { rows } = await client.query<DoctorPanelPatientRow>(
      `SELECT p.id, pi.title AS salutation, pi.first_name, pi.last_name,
              NULLIF(btrim(pi.phone), '') IS NOT NULL AS has_phone,
              NULLIF(btrim(pi.email), '') IS NOT NULL AS has_email,
              CASE
                WHEN EXISTS (SELECT 1 FROM treatment_plan t WHERE t.patient_id = p.id AND t.deleted_at IS NULL
                               AND t.status IN ('in_progress', 'completed')) THEN 'treatment'
                WHEN EXISTS (SELECT 1 FROM treatment_plan t WHERE t.patient_id = p.id AND t.deleted_at IS NULL
                               AND t.status IN ('initiated', 'patient_notified', 'on_hold')) THEN 'plan'
                WHEN EXISTS (SELECT 1 FROM sleep_study s WHERE s.patient_id = p.id
                               AND s.status IN ('results_received', 'interpreted')) THEN 'results'
                WHEN EXISTS (SELECT 1 FROM sleep_study s WHERE s.patient_id = p.id
                               AND s.status IN ('ordered', 'device_shipped', 'device_delivered', 'study_complete')) THEN 'study'
                ELSE 'intake'
              END AS stage
         FROM patient p
         JOIN identities pi ON pi.id = p.identity_id
        WHERE ${careTeamCondition("p", "$1")} AND p.deleted_at IS NULL AND p.status <> 'discharged'
        ORDER BY pi.last_name, pi.first_name, p.id`,
      [practitionerId]
    );
    return rows.map((row) => ({
      id: row.id,
      name: formatOptionalDisplayName({ salutation: row.salutation, first_name: row.first_name, last_name: row.last_name }),
      stage: row.stage,
      has_phone: row.has_phone,
      has_email: row.has_email,
    }));
  } catch (err) {
    throw new DatabaseError("listDoctorPanelPatients", err);
  }
}
