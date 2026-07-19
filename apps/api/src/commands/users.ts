import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { TenantContext } from "../context/TenantContext.js";
import {
  insertStaffUser,
  updateUser,
  softDeleteUser,
  getUserIdByEmail,
  getUserById,
  createPasswordResetToken,
  type UpdateUserInput,
  type StaffRole,
  type User,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { FRONTEND_URL } from "../env.js";
import { hashToken } from "../utils/hashToken.js";
import { sendPasswordResetEmail } from "../mailer.js";

/**
 * COMMANDS — User (staff: rep/manager/kam/msl/admin/doctor) domain.
 *
 * Each command validates, writes, writes audit log, returns result.
 * No req/res. No getDb(). Only ctx.client (tenant-scoped, same transaction).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: StaffRole[] = ["admin", "manager", "kam", "msl", "rep", "doctor"];
const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

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
}

export async function CreateUserCommand(ctx: TenantContext, input: CreateUserInput): Promise<User> {
  const firstName = input.first_name?.trim() ?? "";
  const lastName = input.last_name?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";

  if (!firstName) throw new ValidationError("first_name is required");
  if (!lastName) throw new ValidationError("last_name is required");
  if (!email || !EMAIL_REGEX.test(email)) throw new ValidationError("A valid email is required");
  if (input.role && !VALID_ROLES.includes(input.role)) {
    throw new ValidationError(`role must be one of: ${VALID_ROLES.join(", ")}`);
  }

  const existingId = await getUserIdByEmail(ctx.client, email);
  if (existingId) throw new ConflictError("A user with this email already exists");

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
    input.phone ?? null
  );
  if (!user) throw new ConflictError("A user with this email already exists");

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "Person",
    entity_id: user.id,
    entity_after: { id: user.id, email, name: user.name, role },
    request_id: ctx.requestId,
  });

  return user;
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
  if (input.role && !VALID_ROLES.includes(input.role)) {
    throw new ValidationError(`role must be one of: ${VALID_ROLES.join(", ")}`);
  }

  const before = await updateUser(ctx.client, id, input);
  if (!before) return null;

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "Person",
    entity_id: id,
    entity_after: { status: before.status, region: before.region, role: before.role },
    request_id: ctx.requestId,
  });

  return before;
}

// ---------------------------------------------------------------------------
// RESET USER PASSWORD (admin/manager triggered — emails the target user a reset link)
// ---------------------------------------------------------------------------

export async function ResetUserPasswordCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("user id is required");

  const user = await getUserById(ctx.client, id);
  if (!user) throw new NotFoundError("User", id);

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
  await createPasswordResetToken(ctx.client, user.id, tokenHash, expiresAt);

  const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(user.email, resetLink, {
    title: user.salutation,
    firstName: user.first_name,
    lastName: user.last_name,
    language: user.language,
    region: user.region,
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "reset_password",
    entity_type: "Person",
    entity_id: id,
    request_id: ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// DELETE USER (soft delete)
// ---------------------------------------------------------------------------

export async function DeleteUserCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("user id is required");

  await softDeleteUser(ctx.client, id);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "delete",
    entity_type: "Person",
    entity_id: id,
    request_id: ctx.requestId,
  });
}
