import type { TenantContext } from "../context/TenantContext.js";
import {
  insertOrganization,
  updateOrganization,
  getOrganizationById,
  getOrganizationIdByName,
  softDeleteOrganization,
  type InsertOrganizationInput,
  type UpdateOrganizationInput,
  type Organization,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ConflictError, ValidationError } from "../errors.js";
import { geocodeAddress } from "../services/geocoding.js";

/**
 * COMMANDS — Organization (HCO) domain.
 *
 * Each command:
 *   1. Validates input
 *   2. Executes the DB write via ctx.client (tenant-scoped, same transaction as audit)
 *   3. Writes to audit_log (GDPR Art. 30 compliance)
 *   4. Returns the result
 *
 * Commands never touch `req` or `res`. Independently testable.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// DB CHECK constraint organization_type_check — see infrastructure/db/schema-snapshot.sql.
const ORG_TYPES = ["clinic", "hospital", "pharmacy", "practice", "other"] as const;
// DB CHECK constraint organization_status_check — see infrastructure/db/schema-snapshot.sql.
const ORG_STATUSES = ["pending_approval", "active", "inactive"] as const;

function normalizeOrgType(input: string | undefined): string {
  if (input === undefined) return "other";
  const v = input.trim().toLowerCase();
  if (!ORG_TYPES.includes(v as (typeof ORG_TYPES)[number])) {
    throw new ValidationError(`Invalid organization type: "${input}"`);
  }
  return v;
}

function normalizeOrgStatus(input: string | undefined): string {
  if (input === undefined) return "active";
  const v = input.trim().toLowerCase();
  if (!ORG_STATUSES.includes(v as (typeof ORG_STATUSES)[number])) {
    throw new ValidationError(`Invalid organization status: "${input}"`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// CREATE ORGANIZATION
// ---------------------------------------------------------------------------

export interface CreateOrganizationInput {
  name: string;
  type?: string;
  status?: string;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  region?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  google_link?: string | null;
  specialties?: string[];
  metadata?: Record<string, unknown> | null;
}

/**
 * Creates a new Organization (HCO).
 * Rejects a case-insensitive duplicate name with a ConflictError — an
 * explicit "Create Organization" action must not silently merge into an
 * existing org just because the name string matches (unlike
 * resolveOrganizationId()'s freetext auto-vivify helper in db/practitioner.ts,
 * which is a different, intentionally lenient UX flow).
 */
export async function CreateOrganizationCommand(
  ctx: TenantContext,
  input: CreateOrganizationInput
): Promise<Organization> {
  const name = input.name?.trim() ?? "";
  if (!name) throw new ValidationError("name is required");

  const email = input.email?.trim() ?? "";
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const type = normalizeOrgType(input.type);
  const status = normalizeOrgStatus(input.status);

  const existingId = await getOrganizationIdByName(ctx.client, name);
  if (existingId) throw new ConflictError(`An organization named "${name}" already exists`);

  const address_line1 = input.address_line1?.trim() ?? null;
  const city = input.city?.trim() ?? null;
  const state = input.state?.trim() ?? null;
  const postal_code = input.postal_code?.trim() ?? null;
  const country_code = input.country_code?.trim() ?? null;

  // Best-effort — never blocks the save (see services/geocoding.ts).
  const coordinates = await geocodeAddress({ address_line1, city, state, postal_code, country_code });

  const insertInput: InsertOrganizationInput = {
    name,
    type,
    status,
    address_line1,
    city,
    state,
    postal_code,
    country_code,
    region:        input.region?.trim() ?? "",
    phone:         input.phone?.trim() ?? null,
    email:         email || null,
    website:       input.website?.trim() ?? null,
    google_link:   input.google_link?.trim() ?? null,
    latitude:      coordinates?.lat ?? null,
    longitude:     coordinates?.lng ?? null,
    specialties:   input.specialties,
    metadata:      input.metadata ?? null,
  };

  const organization = await insertOrganization(ctx.client, insertInput);

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "create",
    entity_type:  "Organization",
    entity_id:    organization.id,
    entity_after: {
      id:     organization.id,
      name:   organization.name,
      type:   organization.type,
      status: organization.status,
      region: organization.region,
    },
    request_id: ctx.requestId,
  });

  return organization;
}

// ---------------------------------------------------------------------------
// UPDATE ORGANIZATION
// ---------------------------------------------------------------------------

export interface UpdateOrganizationPayload {
  name?: string;
  type?: string;
  status?: string;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  region?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  google_link?: string | null;
  specialties?: string[];
  metadata?: Record<string, unknown> | null;
}

/**
 * Updates an Organization. Returns null if the organization does not exist.
 * Rejects a rename onto a case-insensitive duplicate of another org's name.
 */
export async function UpdateOrganizationCommand(
  ctx: TenantContext,
  id: string,
  input: UpdateOrganizationPayload
): Promise<Organization | null> {
  if (!id?.trim()) throw new ValidationError("organization id is required");

  const email = input.email?.trim();
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const before = await getOrganizationById(ctx.client, id);
  if (!before) return null;

  let name: string | undefined;
  if (input.name !== undefined) {
    name = input.name.trim();
    if (!name) throw new ValidationError("name cannot be blank");
    const existingId = await getOrganizationIdByName(ctx.client, name, id);
    if (existingId) throw new ConflictError(`An organization named "${name}" already exists`);
  }

  // Only re-geocode when an address field actually changed — an unrelated
  // edit (e.g. phone number) shouldn't spend an API call re-resolving coordinates
  // that haven't moved. Best-effort — never blocks the save.
  const addressChanged =
    input.address_line1 !== undefined ||
    input.city !== undefined ||
    input.state !== undefined ||
    input.postal_code !== undefined ||
    input.country_code !== undefined;

  const coordinates = addressChanged
    ? await geocodeAddress({
        address_line1: input.address_line1 !== undefined ? input.address_line1 : before.address_line1,
        city:          input.city !== undefined ? input.city : before.city,
        state:         input.state !== undefined ? input.state : before.state,
        postal_code:   input.postal_code !== undefined ? input.postal_code : before.postal_code,
        country_code:  input.country_code !== undefined ? input.country_code : before.country_code,
      })
    : undefined;

  const updateInput: UpdateOrganizationInput = {
    name,
    type:          input.type !== undefined ? normalizeOrgType(input.type) : undefined,
    status:        input.status !== undefined ? normalizeOrgStatus(input.status) : undefined,
    address_line1: input.address_line1,
    city:          input.city,
    state:         input.state,
    postal_code:   input.postal_code,
    country_code:  input.country_code,
    region:        input.region,
    phone:         input.phone,
    email:         input.email,
    website:       input.website,
    google_link:   input.google_link,
    // A failed/unconfigured geocode leaves the existing coordinates untouched
    // (undefined) rather than nulling them out — a transient API hiccup on an
    // unrelated address tweak shouldn't erase a pin that already worked.
    latitude:      coordinates ? coordinates.lat : undefined,
    longitude:     coordinates ? coordinates.lng : undefined,
    specialties:   input.specialties,
    metadata:      input.metadata,
  };

  const after = await updateOrganization(ctx.client, id, updateInput);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "Organization",
    entity_id:     id,
    entity_before: { name: before.name, type: before.type, status: before.status, region: before.region },
    entity_after:  { name: after.name,  type: after.type,  status: after.status,  region: after.region },
    request_id:    ctx.requestId,
  });

  return after;
}

// ---------------------------------------------------------------------------
// DELETE ORGANIZATION (soft delete)
// ---------------------------------------------------------------------------

export async function DeleteOrganizationCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("organization id is required");

  await softDeleteOrganization(ctx.client, id);

  await insertAuditLog(ctx.client, {
    user_id:    ctx.user.id,
    action:     "delete",
    entity_type: "Organization",
    entity_id:  id,
    request_id: ctx.requestId,
  });
}
