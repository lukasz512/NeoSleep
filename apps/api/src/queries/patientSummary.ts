import type { TenantContext } from "../context/TenantContext.js";
import { NotFoundError } from "../errors.js";
import { STUDY_ROLES } from "../middleware/requireClinicalRole.js";
import {
  getLatestStudyWithResults,
  getNextAppointment,
  getPatientProfileExtras,
  type PatientLatestStudy,
  type PatientNextAppointment,
  type PatientProfileExtras,
} from "../db/patientSummary.js";
import { getLatestDeviceOrderByPatient, type PatientDeviceOrder } from "../db/treatmentPlan.js";
import { GetPatientByIdQuery } from "./patient.js";

/**
 * QUERY — what the patient's Detalles tab shows beyond the base record
 * (NEO-206): the summary strip (latest PSG, device order, next appointment)
 * and the identity/consent rows. Read-only; the route audits the clinical part.
 */
export interface PatientSummaryDto extends PatientProfileExtras {
  /** Latest sleep study with results — null for the commercial field force (rep/KAM/MSL), who never see AHI/SpO2 (NEO-83). */
  latest_study: PatientLatestStudy | null;
  /** Same "latest device order" the patient list's Next step uses (NEO-223). */
  device_order: PatientDeviceOrder | null;
  next_appointment: PatientNextAppointment | null;
}

export async function GetPatientSummaryQuery(ctx: TenantContext, patientId: string): Promise<PatientSummaryDto> {
  // Territory/doctor-scoped (CORE-104) — 404 when out of reach.
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);

  const canSeeClinical = STUDY_ROLES.includes(ctx.user.role);
  // One pooled client per request: sequential, not Promise.all.
  const profile = await getPatientProfileExtras(ctx.client, patientId);
  if (!profile) throw new NotFoundError("Patient", patientId);
  const latestStudy = canSeeClinical ? await getLatestStudyWithResults(ctx.client, patientId) : null;
  const deviceOrders = await getLatestDeviceOrderByPatient(ctx.client, [patientId]);
  const nextAppointment = await getNextAppointment(ctx.client, patientId);

  return {
    ...profile,
    latest_study: latestStudy,
    device_order: deviceOrders.get(patientId) ?? null,
    next_appointment: nextAppointment,
  };
}
