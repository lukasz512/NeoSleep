import type { TenantContext } from "../context/TenantContext.js";
import {
  getIdentityIdForUser,
  getNotificationsPaginated,
  getUnreadNotificationCount,
  type NotificationListRow,
} from "../db.js";
import { resolveNotificationActions, type NotificationAction } from "../notifications/catalog.js";

/**
 * QUERIES — Notification Center domain (ADR-012).
 *
 * Queries only read. No writes, no audit log — inbox state (read/unread) is
 * not a GDPR-relevant mutation, unlike clinical/personal data changes.
 */

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
  /** Folded repeats of the same event (ADR-027 grouping). */
  group_count: number;
  /** Who the row is about, joined at read time — never stored (CORE-4 D1). */
  subject_name: string | null;
  /** The appointment's start, for appointment events. */
  subject_at: string | null;
  /** Quick actions, only on events that need someone to act (CORE-4 D2). */
  actions: NotificationAction[];
}

function toDto(n: NotificationListRow): NotificationDto {
  return {
    id:          n.id,
    type:        n.type,
    title:       n.title,
    body:        n.body ?? null,
    entity_type: n.entity_type ?? null,
    entity_id:   n.entity_id ?? null,
    action_url:  n.action_url ?? null,
    read_at:     n.read_at instanceof Date ? n.read_at.toISOString() : (n.read_at ?? null),
    created_at:  n.created_at instanceof Date ? n.created_at.toISOString() : String(n.created_at),
    group_count: n.group_count ?? 1,
    subject_name: n.subject_name ?? null,
    subject_at:  n.subject_at instanceof Date ? n.subject_at.toISOString() : (n.subject_at ?? null),
    actions:     resolveNotificationActions(n.type, { phone: n.subject_phone, actionUrl: n.action_url ?? null }),
  };
}

export interface GetNotificationListInput {
  filter?: "all" | "unread";
  page?: number;
  limit?: number;
}

export interface GetNotificationListResult {
  items: NotificationDto[];
  total: number;
}

/** Returns null identity_id (empty result) rather than throwing — a users row with no identity_id would be a data-integrity bug, not something the inbox should 500 on. */
export async function GetNotificationListQuery(
  ctx: TenantContext,
  input: GetNotificationListInput
): Promise<GetNotificationListResult> {
  const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
  if (!identityId) return { items: [], total: 0 };

  const filter = input.filter === "unread" ? "unread" : "all";
  const page   = input.page ?? 1;
  const limit  = input.limit ?? 20;

  const { rows, total } = await getNotificationsPaginated(ctx.client, identityId, filter, page, limit);
  return { items: rows.map(toDto), total };
}

export interface GetUnreadCountResult {
  count: number;
}

export async function GetUnreadNotificationCountQuery(ctx: TenantContext): Promise<GetUnreadCountResult> {
  const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
  if (!identityId) return { count: 0 };

  const count = await getUnreadNotificationCount(ctx.client, identityId);
  return { count };
}
