import type { TenantContext } from "../context/TenantContext.js";
import {
  getIdentityIdForUser,
  markNotificationRead,
  markAllNotificationsRead,
} from "../db.js";
import { NotFoundError, ValidationError } from "../errors.js";

/**
 * COMMANDS — Notification Center domain (ADR-012).
 *
 * No audit_log writes here: marking a notification read/unread is inbox UI
 * state, not a mutation of clinical or personal data (contrast with Lead/
 * Encounter commands, which audit every write per GDPR Art. 30).
 */

export async function MarkNotificationReadCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("notification id is required");

  const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
  if (!identityId) throw new NotFoundError("Notification", id);

  const result = await markNotificationRead(ctx.client, id, identityId);
  if (!result) throw new NotFoundError("Notification", id);
}

export interface MarkAllReadResult {
  updated: number;
}

export async function MarkAllNotificationsReadCommand(ctx: TenantContext): Promise<MarkAllReadResult> {
  const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
  if (!identityId) return { updated: 0 };

  const updated = await markAllNotificationsRead(ctx.client, identityId);
  return { updated };
}
