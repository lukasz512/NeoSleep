import type { TenantContext } from "../context/TenantContext.js";
import {
  insertLead,
  updateLead,
  getLeadById,
  type InsertLeadInput,
  type UpdateLeadInput,
  type Lead,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";

/**
 * COMMANDS — Lead domain.
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

// ---------------------------------------------------------------------------
// CREATE LEAD
// ---------------------------------------------------------------------------

export interface CreateLeadInput {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  region?: string;
  source?: string | null;
  assigned_to?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Creates a new Lead.
 * Supports the legacy `name` field (splits on first space) for backward compat.
 */
export async function CreateLeadCommand(
  ctx: TenantContext,
  input: CreateLeadInput
): Promise<Lead> {
  const firstName = input.first_name?.trim() ?? "";
  const lastName  = input.last_name?.trim() ?? "";
  if (!firstName) throw new ValidationError("first_name is required");
  if (!lastName)  throw new ValidationError("last_name is required");

  const email = input.email?.trim() ?? null;
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const insertInput: InsertLeadInput = {
    first_name:  firstName,
    last_name:   lastName,
    email:       email || null,
    phone:       input.phone?.trim() ?? null,
    status:      input.status?.trim() || "new",
    region:      input.region?.trim() ?? "",
    source:      input.source?.trim() ?? null,
    assigned_to: input.assigned_to?.trim() ?? null,
    metadata:    input.metadata ?? null,
  };

  const lead = await insertLead(ctx.client, insertInput);

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "create",
    entity_type:  "Lead",
    entity_id:    lead.id,
    entity_after: { id: lead.id, name: lead.name, status: lead.status, region: lead.region },
    request_id:   ctx.requestId,
  });

  return lead;
}

// ---------------------------------------------------------------------------
// UPDATE LEAD
// ---------------------------------------------------------------------------

export interface UpdateLeadPayload {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  region?: string;
  source?: string | null;
  assigned_to?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Updates a Lead. Returns null if the lead does not exist.
 */
export async function UpdateLeadCommand(
  ctx: TenantContext,
  id: string,
  input: UpdateLeadPayload
): Promise<Lead | null> {
  if (!id?.trim()) throw new ValidationError("lead id is required");

  const email = input.email?.trim();
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const before = await getLeadById(ctx.client, id);
  if (!before) return null;

  const updateInput: UpdateLeadInput = {
    first_name:  input.first_name,
    last_name:   input.last_name,
    email:       input.email,
    phone:       input.phone,
    status:      input.status,
    region:      input.region,
    source:      input.source,
    assigned_to: input.assigned_to,
    metadata:    input.metadata,
  };

  const after = await updateLead(ctx.client, id, updateInput);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "Lead",
    entity_id:     id,
    entity_before: { status: before.status, region: before.region },
    entity_after:  { status: after.status,  region: after.region },
    request_id:    ctx.requestId,
  });

  return after;
}
