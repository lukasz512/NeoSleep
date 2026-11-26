import type { PoolClient } from "pg";
import { emailT } from "@neo/email";
import {
  insertNotification,
  findGroupableNotification,
  bumpNotificationGroup,
  insertNotificationDelivery,
  getIdentityLanguage,
  type Notification,
} from "../db/notification.js";
import {
  getEventDefinition,
  copyKeys,
  GROUPED_BODY_KEY,
  type NotificationType,
  type NotificationLinkParams,
} from "./catalog.js";
import { resolveChannels, loadRecipientPreferences, getTenantNotificationDefaults } from "./preferences.js";

/**
 * notify() — the one entry point for producing a notification (NEO-134, ADR-027 §2).
 *
 * Runs inside the producer's transaction (pass its client), so a rolled-back
 * booking never notifies anyone. Per recipient identity:
 *   - an unread row of the same type + entity touched in the last 5 min is
 *     bumped (group_count + 1) instead of adding a second row;
 *   - otherwise a new inbox row is written with the catalog's category,
 *     priority, link and PHI-free copy in the recipient's language;
 *   - one notification_delivery row per channel the recipient gets
 *     (preferences.ts: user → tenant default → catalog, locked categories,
 *     quiet hours → not_before): in_app delivered at once, the rest pending
 *     for the delivery worker (CORE-3).
 *
 * `meta` is stored on the row for the app's own use (ids, times). It is never
 * rendered into push/email copy — copy comes only from the catalog's i18n keys.
 */

export const GROUP_WINDOW_MINUTES = 5;

export interface NotifyInput {
  type: NotificationType;
  /** identities.id of each recipient. Duplicates and the actor are dropped. */
  recipients: readonly string[];
  entityId: string | null;
  /** Ids used to build the deep link (e.g. { patientId }). */
  link?: NotificationLinkParams;
  meta?: Record<string, unknown>;
  /** Whoever caused the event — not notified about their own action. */
  actorIdentityId?: string | null;
}

export interface NotifyResult {
  /** One per recipient actually notified, new or bumped. */
  notifications: Notification[];
}

function renderCopy(type: NotificationType, language: string | null, groupCount: number): { title: string; body: string } {
  const keys = copyKeys(type);
  return {
    title: emailT(language, keys.title),
    body: groupCount > 1 ? emailT(language, GROUPED_BODY_KEY, { count: String(groupCount) }) : emailT(language, keys.body),
  };
}

export async function notify(client: PoolClient, input: NotifyInput): Promise<NotifyResult> {
  const def = getEventDefinition(input.type);
  const recipients = Array.from(new Set(input.recipients)).filter((id) => id && id !== input.actorIdentityId);
  const tenantDefaults = recipients.length > 0 ? await getTenantNotificationDefaults(client) : {};
  const actionUrl = def.link({ entityId: input.entityId, ...input.link });
  const metadata = input.meta ?? null;
  const notifications: Notification[] = [];

  for (const identityId of recipients) {
    const language = await getIdentityLanguage(client, identityId);
    const existing = await findGroupableNotification(client, identityId, input.type, input.entityId, GROUP_WINDOW_MINUTES);

    let row: Notification;
    if (existing) {
      const copy = renderCopy(input.type, language, existing.group_count + 1);
      row = await bumpNotificationGroup(client, existing.id, { ...copy, metadata });
    } else {
      const copy = renderCopy(input.type, language, 1);
      row = await insertNotification(client, {
        identity_id: identityId,
        type: input.type,
        title: copy.title,
        body: copy.body,
        entity_type: def.entityType,
        entity_id: input.entityId,
        action_url: actionUrl,
        metadata,
        category: def.category,
        priority: def.priority,
      });
    }

    const channels = resolveChannels(def, await loadRecipientPreferences(client, identityId), tenantDefaults);
    for (const { channel, notBefore } of channels) {
      await insertNotificationDelivery(client, row.id, channel, notBefore);
    }
    notifications.push(row);
  }

  return { notifications };
}
