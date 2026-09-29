import type { TenantContext } from "../context/TenantContext.js";
import { getPatientById, getPractitionerById, getOrganizationById } from "../db.js";
import { NotFoundError } from "../errors.js";
import { assertTerritoryAccessByTerritoryId } from "../middleware/requireScope.js";

/**
 * Parent-record guards for sub-resources (history, documents) — NEO-48.
 * A sub-route must never reach further than GET /<entity>/:id does: fetch the
 * parent, 404 if it's gone, 403 if it's outside the caller's territory. Plain
 * row lookups, not the full *ByIdQuery DTO build (no affiliation/territory-path
 * joins needed just to answer "may this user see it").
 */

export async function requirePatientInScope(ctx: TenantContext, patientId: string): Promise<void> {
  const patient = await getPatientById(ctx.client, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);
  await assertTerritoryAccessByTerritoryId(ctx, patient.territory_id);
}

export async function requirePractitionerInScope(ctx: TenantContext, practitionerId: string): Promise<void> {
  const practitioner = await getPractitionerById(ctx.client, practitionerId);
  if (!practitioner) throw new NotFoundError("Practitioner", practitionerId);
  await assertTerritoryAccessByTerritoryId(ctx, practitioner.territory_id);
}

export async function requireOrganizationInScope(ctx: TenantContext, organizationId: string): Promise<void> {
  const organization = await getOrganizationById(ctx.client, organizationId);
  if (!organization) throw new NotFoundError("Organization", organizationId);
  await assertTerritoryAccessByTerritoryId(ctx, organization.territory_id);
}
