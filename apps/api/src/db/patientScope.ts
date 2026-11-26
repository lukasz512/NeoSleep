import { careTeamCondition } from "./careTeam.js";

/**
 * SQL side of the patient access policy (CORE-104, queries/entityAccess.ts) for list
 * queries of records that hang off a patient (sleep studies, treatment plans, …).
 * Same rules as getPatientsPaginated: a forced practitioner_id for a doctor (primary
 * doctor or care team, CORE-132), territory
 * paths for manager / field (a patient with no territory passes — rollout fallback).
 */
export interface PatientScope {
  practitioner_id?: string;
  /** null = unrestricted. */
  scopePaths: string[] | null;
}

/**
 * Pushes its params onto `params` and returns a condition restricting `patientIdExpr`
 * (e.g. "s.patient_id") to visible patients, or null when the scope is unrestricted.
 */
export function patientScopeCondition(scope: PatientScope | undefined, params: unknown[], patientIdExpr: string): string | null {
  if (!scope) return null;
  const parts: string[] = [];
  if (scope.practitioner_id) {
    params.push(scope.practitioner_id);
    parts.push(careTeamCondition("sp", `$${params.length}`));
  }
  if (scope.scopePaths !== null) {
    params.push(scope.scopePaths);
    parts.push(`(si.territory_id IS NULL OR st.path <@ ANY($${params.length}::extensions.ltree[]))`);
  }
  if (parts.length === 0) return null;
  return `EXISTS (SELECT 1 FROM patient sp
    JOIN identities si ON si.id = sp.identity_id
    LEFT JOIN territory st ON st.id = si.territory_id
    WHERE sp.id = ${patientIdExpr} AND ${parts.join(" AND ")})`;
}
