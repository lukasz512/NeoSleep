import type { TenantContext } from "../context/TenantContext.js";
import { getPatientById, getPractitionerById, getOrganizationById, getIdentityIdForUser, getPractitionerIdByIdentityId, type Patient } from "../db.js";
import { ForbiddenError, NotFoundError } from "../errors.js";
import { assertTerritoryAccessByTerritoryId, getAllowedScopePaths } from "../middleware/requireScope.js";

/**
 * ONE access policy for every patient-linked record (CORE-104).
 *
 * Who sees which patients:
 *   admin               every patient in their territories (usually global; NEO-47 region-scoped admins)
 *   doctor              only patients assigned to them (patient.practitioner_id = their
 *                       practitioner row, ADR-014); territory doesn't widen or narrow it
 *   manager / field     patients in their territories (requireScope.ts)
 *
 * Every list and by-id read, and every write, of a patient or anything hanging off one
 * (sleep studies, treatment plans, documents, notes, questionnaires, orders) goes through
 * getViewer + patientListScope / requirePatientInScope — never a hand-rolled check.
 * Another doctor's patient answers 404, not 403: a doctor must not learn it exists.
 */

export type ViewerKind = "admin" | "manager" | "doctor" | "field";

export interface Viewer {
  kind: ViewerKind;
  /** The doctor's own practitioner id (doctor only). */
  practitionerId: string | null;
  /** Territory paths; null = unrestricted. Always null for a doctor. */
  scopePaths: string[] | null;
}

const viewerCache = new WeakMap<TenantContext, Promise<Viewer>>();

/** The caller's viewer, resolved once per request (ctx). A doctor not linked to a practitioner → 403. */
export function getViewer(ctx: TenantContext): Promise<Viewer> {
  let viewer = viewerCache.get(ctx);
  if (!viewer) {
    viewer = resolveViewer(ctx);
    viewerCache.set(ctx, viewer);
  }
  return viewer;
}

async function resolveViewer(ctx: TenantContext): Promise<Viewer> {
  const role = ctx.user.role;
  if (role === "doctor") {
    const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
    const practitionerId = identityId ? await getPractitionerIdByIdentityId(ctx.client, identityId) : null;
    if (!practitionerId) throw new ForbiddenError("This doctor account is not linked to a practitioner record");
    return { kind: "doctor", practitionerId, scopePaths: null };
  }
  const scopePaths = await getAllowedScopePaths(ctx.client, ctx.user.roles);
  const kind: ViewerKind = role === "admin" ? "admin" : role === "manager" ? "manager" : "field";
  return { kind, practitionerId: null, scopePaths };
}

/**
 * Filters for any patient list query: a doctor's list is always their own, whatever
 * practitioner_id the client sent; everyone else keeps their optional filter + territory.
 */
export function patientListScope(viewer: Viewer, requestedPractitionerId?: string): { practitioner_id?: string; scopePaths: string[] | null } {
  if (viewer.kind === "doctor") return { practitioner_id: viewer.practitionerId!, scopePaths: null };
  return { practitioner_id: requestedPractitionerId, scopePaths: viewer.scopePaths };
}

/** Throws (404 for another doctor's patient, 403 outside territory) when the viewer may not reach this patient. */
export async function assertCanSeePatient(ctx: TenantContext, patient: Pick<Patient, "id" | "practitioner_id" | "territory_id">): Promise<void> {
  const viewer = await getViewer(ctx);
  if (viewer.kind === "doctor") {
    if (patient.practitioner_id !== viewer.practitionerId) throw new NotFoundError("Patient", patient.id);
    return;
  }
  await assertTerritoryAccessByTerritoryId(ctx, patient.territory_id);
}

/**
 * Parent-record guard for every patient sub-resource (NEO-48, CORE-104): a sub-route
 * never reaches further than GET /patient/:id. Returns the patient row.
 */
export async function requirePatientInScope(ctx: TenantContext, patientId: string): Promise<Patient & { name: string }> {
  const patient = await getPatientById(ctx.client, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);
  await assertCanSeePatient(ctx, patient);
  return patient;
}

/**
 * The practitioner_id a create/update may set. A doctor's patients are always their own:
 * create assigns them, and a doctor can't hand a patient to anyone else.
 */
export async function practitionerIdForWrite(ctx: TenantContext, requested: string | null | undefined): Promise<string | null | undefined> {
  const viewer = await getViewer(ctx);
  if (viewer.kind !== "doctor") return requested;
  // Empty (the PWA form's unset picker sends null) means "me", never "nobody".
  if (requested && requested !== viewer.practitionerId) {
    throw new ForbiddenError("A doctor cannot assign a patient to another doctor");
  }
  return viewer.practitionerId;
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
