import { createHash } from "node:crypto";
import type { TenantContext } from "../context/TenantContext.js";
import { GetAppointmentsQuery } from "./appointment.js";
import { GetEncounterListQuery } from "./encounter.js";
import { GetPatientByIdQuery } from "./patient.js";
import { GetPatientSummaryQuery } from "./patientSummary.js";

/**
 * QUERY: a fingerprint of everything the patient card shows on Detalles
 * (record, summary strip, visits, events), built from the same scoped reads
 * the card makes. The open card polls it and reloads only when it moved,
 * the same pattern as /checklist/version (NEO-173). It returns a hash, not
 * health data, so the route writes no read audit row. Throws 404 like the
 * summary when the patient is out of reach.
 */
export async function GetPatientCardVersionQuery(ctx: TenantContext, patientId: string): Promise<string> {
  // One pooled client per request: sequential, not Promise.all.
  const summary = await GetPatientSummaryQuery(ctx, patientId);
  const record = await GetPatientByIdQuery(ctx, patientId);
  const { items: appointments } = await GetAppointmentsQuery(ctx, { patient_id: patientId });
  const { items: events } = await GetEncounterListQuery(ctx, { patient_id: patientId });
  return createHash("sha256").update(JSON.stringify({ record, summary, appointments, events })).digest("hex").slice(0, 32);
}
