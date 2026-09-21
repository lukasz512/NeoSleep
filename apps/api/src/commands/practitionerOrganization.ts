import type { TenantContext } from "../context/TenantContext.js";
import {
  getPractitionerById,
  getOrganizationById,
  getOrganizationAffiliations,
  getUserPrimaryOrganizationId,
  linkPractitionerOrganization,
  unlinkPractitionerOrganization,
  setGlobalPrimaryOrganization,
  setUserPrimaryOrganization,
  insertAuditLog,
  type OrganizationAffiliation,
} from "../db.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { assertTerritoryAccessByTerritoryId } from "../middleware/requireScope.js";

/**
 * COMMANDS — Practitioner clinic affiliations.
 *
 * "Primary" is dual-scoped, not one field (see docs/stories/pwa-medico-view.md):
 *   - admin/manager write the shared global default (practitioner_organization.is_primary)
 *   - rep writes only their own relationship (practitioner_assignment.primary_org_id),
 *     always scoped to ctx.user.id — there is no "assign on behalf of another rep" here.
 */

async function loadPractitionerOrThrow(ctx: TenantContext, practitionerId: string) {
  const practitioner = await getPractitionerById(ctx.client, practitionerId);
  if (!practitioner) throw new NotFoundError("Practitioner", practitionerId);
  await assertTerritoryAccessByTerritoryId(ctx, practitioner.territory_id);
  return practitioner;
}

// ---------------------------------------------------------------------------
// LINK
// ---------------------------------------------------------------------------

export interface LinkPractitionerOrganizationInput {
  organization_id: string;
  role?: string | null;
}

export async function LinkPractitionerOrganizationCommand(
  ctx: TenantContext,
  practitionerId: string,
  input: LinkPractitionerOrganizationInput
): Promise<OrganizationAffiliation[]> {
  const organizationId = input.organization_id?.trim();
  if (!organizationId) throw new ValidationError("organization_id is required");

  await loadPractitionerOrThrow(ctx, practitionerId);

  const organization = await getOrganizationById(ctx.client, organizationId);
  if (!organization) throw new NotFoundError("Organization", organizationId);

  await linkPractitionerOrganization(ctx.client, practitionerId, organizationId, input.role?.trim() || null);

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "update",
    entity_type:  "PractitionerOrganization",
    entity_id:    practitionerId,
    entity_after: { organization_id: organizationId, role: input.role ?? null },
    request_id:   ctx.requestId,
  });

  return getOrganizationAffiliations(ctx.client, practitionerId);
}

// ---------------------------------------------------------------------------
// UNLINK
// ---------------------------------------------------------------------------

export async function UnlinkPractitionerOrganizationCommand(
  ctx: TenantContext,
  practitionerId: string,
  organizationId: string
): Promise<OrganizationAffiliation[]> {
  await loadPractitionerOrThrow(ctx, practitionerId);

  const removed = await unlinkPractitionerOrganization(ctx.client, practitionerId, organizationId);
  if (!removed) throw new NotFoundError("Clinic affiliation", organizationId);

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "PractitionerOrganization",
    entity_id:     practitionerId,
    entity_before: { organization_id: organizationId },
    request_id:    ctx.requestId,
  });

  return getOrganizationAffiliations(ctx.client, practitionerId);
}

// ---------------------------------------------------------------------------
// SET PRIMARY (dual-scoped — see file doc comment)
// ---------------------------------------------------------------------------

export interface SetPrimaryResult {
  organizations: OrganizationAffiliation[];
  my_primary_organization_id: string | null;
}

export async function SetPractitionerOrganizationPrimaryCommand(
  ctx: TenantContext,
  practitionerId: string,
  organizationId: string
): Promise<SetPrimaryResult> {
  await loadPractitionerOrThrow(ctx, practitionerId);

  const affiliations = await getOrganizationAffiliations(ctx.client, practitionerId);
  const isLinked = affiliations.some((a) => a.organization_id === organizationId);
  if (!isLinked) throw new ValidationError("Practitioner is not linked to this clinic yet");

  if (ctx.user.role === "admin" || ctx.user.role === "manager") {
    await setGlobalPrimaryOrganization(ctx.client, practitionerId, organizationId);
    await insertAuditLog(ctx.client, {
      user_id:      ctx.user.id,
      action:       "update",
      entity_type:  "PractitionerOrganization",
      entity_id:    practitionerId,
      entity_after: { is_primary_organization_id: organizationId },
      request_id:   ctx.requestId,
    });
  } else {
    // rep (route already restricts callers to admin/manager/rep — see routes/practitioner.ts)
    await setUserPrimaryOrganization(ctx.client, practitionerId, ctx.user.id, organizationId);
    await insertAuditLog(ctx.client, {
      user_id:      ctx.user.id,
      action:       "update",
      entity_type:  "PractitionerAssignment",
      entity_id:    practitionerId,
      entity_after: { primary_org_id: organizationId },
      request_id:   ctx.requestId,
    });
  }

  // Matches GetPractitionerByIdQuery's contract: my_primary_organization_id is
  // only ever populated for a rep (their own assignment row) — admin/manager
  // have no personal assignment by design, see file doc comment.
  const myPrimaryOrganizationId = ctx.user.role === "rep"
    ? await getUserPrimaryOrganizationId(ctx.client, practitionerId, ctx.user.id)
    : null;

  return {
    organizations: await getOrganizationAffiliations(ctx.client, practitionerId),
    my_primary_organization_id: myPrimaryOrganizationId,
  };
}
