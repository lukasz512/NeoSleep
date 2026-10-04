import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import { displayNameSql } from "../utils/personName.js";

/**
 * Patient care team (CORE-132, migration 050). A patient has one primary doctor
 * (patient.practitioner_id) plus any number of team members (patient_practitioner);
 * a doctor reaches a patient when they are either. The primary doctor is never
 * stored as a row, so the two can't disagree.
 */

export const CARE_TEAM_SOURCES = ["appointment", "manual", "former_primary"] as const;
export type CareTeamSource = (typeof CARE_TEAM_SOURCES)[number];

export interface CareTeamMember {
  practitioner_id: string;
  name: string;
  primary_specialty: string | null;
  specialties: string[];
  primary: boolean;
  /** null for the primary doctor. */
  source: CareTeamSource | null;
  appointment_id: string | null;
  added_by_name: string | null;
  /** When the HCP got access through the team; null for the primary doctor. */
  added_at: string | null;
}

export interface CareTeamRow {
  id: string;
  patient_id: string;
  practitioner_id: string;
  source: CareTeamSource;
  appointment_id: string | null;
  added_by_user_id: string | null;
  created_at: string;
}

/**
 * SQL condition: the practitioner in `practitionerParam` (e.g. "$1") is the primary
 * doctor of, or on the care team of, the patient row aliased `patientAlias`.
 */
export function careTeamCondition(patientAlias: string, practitionerParam: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(patientAlias)) throw new Error(`careTeamCondition: invalid alias "${patientAlias}"`);
  if (!/^\$\d+$/.test(practitionerParam)) throw new Error(`careTeamCondition: invalid param "${practitionerParam}"`);
  return `(${patientAlias}.practitioner_id = ${practitionerParam}
    OR EXISTS (SELECT 1 FROM patient_practitioner ctm
               WHERE ctm.patient_id = ${patientAlias}.id AND ctm.practitioner_id = ${practitionerParam}))`;
}

export async function isOnCareTeam(client: PoolClient, patientId: string, practitionerId: string): Promise<boolean> {
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM patient p WHERE p.id = $2 AND p.deleted_at IS NULL AND ${careTeamCondition("p", "$1")}`,
      [practitionerId, patientId]
    );
    return rows.length > 0;
  } catch (err) {
    throw new DatabaseError("isOnCareTeam", err);
  }
}

/** Adds the HCP to the team; null when they were already on it. */
export async function insertCareTeamMember(
  client: PoolClient,
  row: { patient_id: string; practitioner_id: string; source: CareTeamSource; appointment_id?: string | null; added_by_user_id: string | null }
): Promise<CareTeamRow | null> {
  try {
    const { rows } = await client.query<CareTeamRow>(
      `INSERT INTO patient_practitioner (patient_id, practitioner_id, source, appointment_id, added_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (patient_id, practitioner_id) DO NOTHING
       RETURNING id, patient_id, practitioner_id, source, appointment_id, added_by_user_id, created_at`,
      [row.patient_id, row.practitioner_id, row.source, row.appointment_id ?? null, row.added_by_user_id]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("insertCareTeamMember", err);
  }
}

export async function deleteCareTeamMember(client: PoolClient, patientId: string, practitionerId: string): Promise<CareTeamRow | null> {
  try {
    const { rows } = await client.query<CareTeamRow>(
      `DELETE FROM patient_practitioner WHERE patient_id = $1 AND practitioner_id = $2
       RETURNING id, patient_id, practitioner_id, source, appointment_id, added_by_user_id, created_at`,
      [patientId, practitionerId]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("deleteCareTeamMember", err);
  }
}

/**
 * D2 (care-team-r1): after a visit is cancelled or deleted, the HCP leaves the team when
 * the visit was what added them, they have no other live (not cancelled) visit with the
 * patient, and they recorded nothing for this patient since joining (no write in
 * audit_log that names the patient). Returns the removed row, or null when they stay.
 */
export async function deleteCareTeamMemberIfUntouched(client: PoolClient, patientId: string, practitionerId: string): Promise<CareTeamRow | null> {
  try {
    const { rows } = await client.query<CareTeamRow>(
      `DELETE FROM patient_practitioner pp
        WHERE pp.patient_id = $1 AND pp.practitioner_id = $2 AND pp.source = 'appointment'
          AND NOT EXISTS (SELECT 1 FROM appointment a
                           WHERE a.patient_id = $1 AND a.practitioner_id = $2
                             AND a.deleted_at IS NULL AND a.status <> 'cancelled')
          AND NOT EXISTS (SELECT 1 FROM audit_log al
                            JOIN users u ON u.id = al.user_id
                            JOIN practitioner pr ON pr.identity_id = u.identity_id
                           WHERE pr.id = $2 AND al.created_at >= pp.created_at
                             AND al.action NOT IN ('read', 'notify')
                             AND (al.entity_id = $1::text
                                  OR al.entity_after->>'patient_id' = $1::text
                                  OR al.entity_before->>'patient_id' = $1::text))
       RETURNING pp.id, pp.patient_id, pp.practitioner_id, pp.source, pp.appointment_id, pp.added_by_user_id, pp.created_at`,
      [patientId, practitionerId]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("deleteCareTeamMemberIfUntouched", err);
  }
}

interface CareTeamMemberRow {
  practitioner_id: string;
  name: string;
  primary_specialty: string | null;
  specialties: string[] | null;
  primary: boolean;
  source: CareTeamSource | null;
  appointment_id: string | null;
  added_by_name: string | null;
  added_at: Date | null;
}

/** The primary doctor first, then the team in the order they joined. */
export async function listCareTeam(client: PoolClient, patientId: string): Promise<CareTeamMember[]> {
  try {
    const { rows } = await client.query<CareTeamMemberRow>(
      `WITH members AS (
         SELECT p.practitioner_id, true AS "primary", NULL::text AS source, NULL::uuid AS appointment_id,
                NULL::uuid AS added_by_user_id, NULL::timestamptz AS added_at
           FROM patient p WHERE p.id = $1 AND p.practitioner_id IS NOT NULL
         UNION ALL
         SELECT pp.practitioner_id, false, pp.source, pp.appointment_id, pp.added_by_user_id, pp.created_at
           FROM patient_practitioner pp
           JOIN patient p ON p.id = pp.patient_id
          WHERE pp.patient_id = $1 AND pp.practitioner_id IS DISTINCT FROM p.practitioner_id
       )
       SELECT m.practitioner_id, ${displayNameSql("pi")} AS name, pr.primary_specialty, pr.specialties,
              m."primary", m.source, m.appointment_id, NULLIF(${displayNameSql("ai")}, '') AS added_by_name, m.added_at
         FROM members m
         JOIN practitioner pr ON pr.id = m.practitioner_id
         JOIN identities pi ON pi.id = pr.identity_id
         LEFT JOIN users au ON au.id = m.added_by_user_id
         LEFT JOIN identities ai ON ai.id = au.identity_id
        ORDER BY m."primary" DESC, m.added_at ASC`,
      [patientId]
    );
    return rows.map((r) => ({
      practitioner_id: r.practitioner_id,
      name: r.name,
      primary_specialty: r.primary_specialty,
      specialties: r.specialties ?? [],
      primary: r.primary,
      source: r.source,
      appointment_id: r.appointment_id,
      added_by_name: r.added_by_name,
      added_at: r.added_at ? r.added_at.toISOString() : null,
    }));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("listCareTeam", err);
  }
}
