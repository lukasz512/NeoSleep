import type { TenantContext } from "../context/TenantContext.js";
import { listStopBangScreeningsForPatient, type StopBangScreening } from "../db/stopBangScreening.js";

/** Newest first — STOP-Bang recurs over time, unlike endo_intake's single row. */
export async function ListStopBangScreeningsQuery(ctx: TenantContext, patientId: string): Promise<StopBangScreening[]> {
  return listStopBangScreeningsForPatient(ctx.client, patientId);
}
