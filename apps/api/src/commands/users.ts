import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { TenantContext } from "../context/TenantContext.js";
import {
  insertStaffUser,
  updateUser,
  softDeleteUser,
  getUserIdByEmail,
  getUserById,
  getTerritoryById,
  createPasswordResetToken,
  getTenantName,
  type UpdateUserInput,
  type StaffRole,
  type User,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { syncSupportPlatformAccess } from "../db/platformAdmin.js";
import { assertTerritoryAccess } from "../middleware/requireScope.js";
import { EmailInUseError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { hashToken } from "../utils/hashToken.js";
import { sendPasswordResetEmail, sendAccountCreatedEmail } from "../mailer.js";

/**
 * COMMANDS — User (staff: rep/manager/kam/msl/admin/doctor) domain.
 *
 * Each command validates, writes, writes audit log, returns result.
 * No req/res. No getDb(). Only ctx.client (tenant-scoped, same transaction).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 'doctor' deliberately excluded: doctor-role users are only ever created via
// InvitePractitionerCommand (partner invite) or the HCP "training finished"
// activation flow — never through manual user creation, and never set as a
// *new* value on CreateUserCommand/UpdateUserCommand (see below). An
// existing doctor user's unchanged role is allowed to round-trip through
// UpdateUserCommand — this list only gates role being newly assigned.
const VALID_ROLES: StaffRole[] = ["admin", "manager", "kam", "msl", "rep", "support"];
/** Roles only an admin may grant, change, or hold the credentials of (NEO-266). A manager
 *  could otherwise promote themselves, or reset an admin's/NeoCRM-support's password and
 *  take the account over. */
const ADMIN_ONLY_ROLES: readonly StaffRole[] = ["admin", "support"];
function assertMayGrantRole(ctx: TenantContext, role: StaffRole | undefined): void {
  if (role && ADMIN_ONLY_ROLES.includes(role) && ctx.user.role !== "admin") {
    throw new ForbiddenError(`Only an admin can assign the ${role} role`);
  }
}
function assertMayManageUser(ctx: TenantContext, target: { role: StaffRole }): void {
  if (ADMIN_ONLY_ROLES.includes(target.role) && ctx.user.role !== "admin") {
    throw new ForbiddenError(`Only an admin can manage ${target.role} users`);
  }
}
const BCRYPT_ROUNDS = 12;

/** A user's own RBAC scope must be a country or the global root (migration
 *  022) — never an arbitrary deeper node (a city/district) the way Patient/
 *  HCP/HCO's own territory_id can be. Throws ValidationError if not. */
async function assertValidScopeKind(ctx: TenantContext, territoryId: string): Promise<void> {
  const territory = await getTerritoryById(ctx.client, territoryId);
  if (!territory || !["country", "global"].includes(territory.kind)) {
    throw new ValidationError("territory_id must reference a country or the global scope");
  }
}
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
/** A new staff member may not open the welcome email the same day (CORE-199). */
const ACCOUNT_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// CREATE USER
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  salutation?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  password?: string | null;
  role?: StaffRole;
  region?: string | null;
  country_code?: string | null;
  phone?: string | null;
  /** RBAC access scope for `role` — a territory id (country or global root,
   *  migration 022). Defaults to insertStaffUser's own 'global' default. */
  territory_id?: string | null;
}

export type InviteEmailStatus = "sent" | "not_sent";

/**
 * A mail failure never rolls the user back: the account exists either way, and
 * `invite_email` tells the caller whether the welcome email went out so the UI
 * can point the admin at "Reset password" when it did not.
 */
export async function CreateUserCommand(
  ctx: TenantContext,
  input: CreateUserInput,
  /** Resolved by the route from the request (see utils/frontendOrigin.ts) — commands have no req/res. */
  frontendOrigin: string
): Promise<User & { invite_email: InviteEmailStatus }> {
  const firstName = input.first_name?.trim() ?? "";
  const lastName = input.last_name?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";

  if (!firstName) throw new ValidationError("first_name is required");
  if (!lastName) throw new ValidationError("last_name is required");
  if (!email || !EMAIL_REGEX.test(email)) throw new ValidationError("A valid email is required", "email");
  if (input.role && !VALID_ROLES.includes(input.role)) {
    throw new ValidationError(`role must be one of: ${VALID_ROLES.join(", ")}`);
  }
  assertMayGrantRole(ctx, input.role);
  if (input.territory_id) await assertValidScopeKind(ctx, input.territory_id);

  const existingId = await getUserIdByEmail(ctx.client, email);
  if (existingId) throw new EmailInUseError(email);

  const passwordHash = input.password ? await bcrypt.hash(input.password, BCRYPT_ROUNDS) : null;
  const role = input.role ?? "rep";

  const user = await insertStaffUser(
    ctx.client,
    email,
    firstName,
    lastName,
    role,
    passwordHash,
    !input.password,
    input.salutation ?? null,
    input.phone ?? null,
    input.territory_id ?? undefined,
    ctx.user.id,
    input.country_code ?? null
  );
  if (!user) throw new EmailInUseError(email);
  await syncSupportPlatformAccess(ctx.client, ctx.user.email, user);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "User",
    entity_id: user.id,
    entity_after: { id: user.id, email, name: user.name, role, territory_id: user.scope_territory_id },
    request_id: ctx.requestId,
  });

  const invite_email = await sendAccountCreatedInvite(ctx, user, frontendOrigin);

  return { ...user, invite_email };
}

async function sendAccountCreatedInvite(ctx: TenantContext, user: User, frontendOrigin: string): Promise<InviteEmailStatus> {
  // DB work stays outside the try: a failing query would poison the transaction, so it must surface.
  const token = crypto.randomBytes(32).toString("hex");
  await createPasswordResetToken(ctx.client, user.id, hashToken(token), new Date(Date.now() + ACCOUNT_INVITE_EXPIRY_MS));
  const tenantName = await getTenantName(ctx.client);

  let sent = false;
  try {
    const messageId = await sendAccountCreatedEmail(
      user.email,
      `${frontendOrigin}/reset-password?token=${encodeURIComponent(token)}`,
      {
        title: user.salutation,
        firstName: user.first_name,
        lastName: user.last_name,
        language: user.language,
        region: user.region ?? user.country_code,
      },
      { inviterName: ctx.user.name?.trim() || ctx.user.email, tenantName }
    );
    sent = messageId !== null;
  } catch (err) {
    console.error("[users] Welcome email failed; the account was kept:", err);
  }
  if (!sent) return "not_sent";

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "invite_sent",
    entity_type: "User",
    entity_id: user.id,
    request_id: ctx.requestId,
  });
  return "sent";
}

// ---------------------------------------------------------------------------
// UPDATE USER
// ---------------------------------------------------------------------------

export async function UpdateUserCommand(
  ctx: TenantContext,
  id: string,
  input: UpdateUserInput
): Promise<User | null> {
  if (!id?.trim()) throw new ValidationError("user id is required");
  if (input.status && !["active", "inactive", "suspended"].includes(input.status)) {
    throw new ValidationError("Invalid status");
  }
  if (input.territory_id) await assertValidScopeKind(ctx, input.territory_id);
  if (input.email !== undefined) {
    input = { ...input, email: input.email.trim().toLowerCase() };
    if (!input.email || !EMAIL_REGEX.test(input.email)) throw new ValidationError("A valid email is required", "email");
  }

  const target = await getUserById(ctx.client, id);
  if (!target) return null;
  await assertTerritoryAccess(ctx, target.country_code);
  assertMayManageUser(ctx, target);

  // Only validate/authorize `role` when it's actually changing — an
  // unchanged doctor/kam/msl value must round-trip through an edit of
  // unrelated fields (territory, status, ...) without failing VALID_ROLES,
  // which deliberately excludes 'doctor' (ADR-014: doctor accounts are only
  // ever provisioned via InvitePractitionerCommand's GDPR-consent flow).
  if (input.role !== undefined && input.role !== target.role) {
    assertMayGrantRole(ctx, input.role);
    if (!VALID_ROLES.includes(input.role)) {
      throw new ValidationError(`role must be one of: ${VALID_ROLES.join(", ")}`);
    }
  }

  const before = await updateUser(ctx.client, id, input, ctx.user.id);
  if (!before) return null;
  const after = await getUserById(ctx.client, id);
  if (after) await syncSupportPlatformAccess(ctx.client, ctx.user.email, after);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "User",
    entity_id: id,
    entity_before: input.email !== undefined && input.email !== target.email ? { email: target.email } : undefined,
    entity_after: {
      status: before.status, region: before.region, role: before.role, territory_id: before.scope_territory_id,
      ...(input.email !== undefined && input.email !== target.email ? { email: input.email } : {}),
    },
    request_id: ctx.requestId,
  });

  return before;
}

// ---------------------------------------------------------------------------
// RESET USER PASSWORD (admin/manager triggered — emails the target user a reset link)
// ---------------------------------------------------------------------------

export async function ResetUserPasswordCommand(
  ctx: TenantContext,
  id: string,
  /** Resolved by the route from the request (see utils/frontendOrigin.ts) — commands
   * don't have req/res, so this can't be resolved here; the caller must pass it in. */
  frontendOrigin: string
): Promise<void> {
  if (!id?.trim()) throw new ValidationError("user id is required");

  const user = await getUserById(ctx.client, id);
  if (!user) throw new NotFoundError("User", id);
  assertMayManageUser(ctx, user);

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
  await createPasswordResetToken(ctx.client, user.id, tokenHash, expiresAt);

  const resetLink = `${frontendOrigin}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(user.email, resetLink, {
    title: user.salutation,
    firstName: user.first_name,
    lastName: user.last_name,
    language: user.language,
    region: user.region ?? user.country_code,
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "reset_password",
    entity_type: "User",
    entity_id: id,
    request_id: ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// DELETE USER (soft delete)
// ---------------------------------------------------------------------------

export async function DeleteUserCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("user id is required");

  const target = await getUserById(ctx.client, id);
  if (!target) throw new NotFoundError("User", id);
  await assertTerritoryAccess(ctx, target.country_code);
  assertMayManageUser(ctx, target);

  await softDeleteUser(ctx.client, id);
  await syncSupportPlatformAccess(ctx.client, ctx.user.email, { ...target, deleted: true });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "delete",
    entity_type: "User",
    entity_id: id,
    request_id: ctx.requestId,
  });
}
