import type { TenantContext } from "../context/TenantContext.js";
import { getEndoIntakeByPatientId, type EndoIntake } from "../db/endoIntake.js";

/** Returns null (not an error) when the patient hasn't been intake-checklisted yet — same "editable but empty" convention as GetCurrentDocumentContentQuery's own hasContent flag. */
export async function GetEndoIntakeQuery(ctx: TenantContext, patientId: string): Promise<EndoIntake | null> {
  return getEndoIntakeByPatientId(ctx.client, patientId);
}
