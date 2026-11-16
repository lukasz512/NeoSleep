import type { PoolClient } from "pg";
import type { WebhookEventPayload } from "resend";
import { withTenant, getActiveTenantSlugs, tenantSlugFromHost } from "../db/tenant.js";
import { applyPatientEmailStatus, patientEmailSendExists, type PatientEmailStatus } from "../db/patientEmailSend.js";
import { claimWebhookEvent, finishWebhookEvent } from "../db/webhookEvent.js";

/**
 * NEO-190: turns a verified Resend webhook event into a delivery status on
 * the patient_email_send row it belongs to. The webhook is one endpoint for
 * every tenant, so the tenant comes from the "tenant" tag the email was sent
 * with (mailer.ts EmailTags) and must be an active tenant (or the default one
 * this API serves) — a tag can't point the update at an arbitrary schema.
 * Emails without that tag (password reset, partner invites …) have no row
 * and are ignored.
 *
 * Opens and clicks are ignored on purpose: patient emails carry no tracking.
 */
const STATUS_BY_EVENT: Partial<Record<WebhookEventPayload["type"], PatientEmailStatus>> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
  "email.complained": "complained",
};

export type EmailDeliveryOutcome = "applied" | "ignored_event" | "no_tenant" | "unknown_email" | "stale" | "duplicate" | "failed";

function statusDetail(event: WebhookEventPayload): string | null {
  switch (event.type) {
    case "email.bounced":
      return [event.data.bounce.type, event.data.bounce.subType, event.data.bounce.message].filter(Boolean).join(" · ").slice(0, 500);
    case "email.failed":
      return event.data.failed.reason.slice(0, 500);
    case "email.suppressed":
      return [event.data.suppressed.type, event.data.suppressed.message].filter(Boolean).join(" · ").slice(0, 500);
    default:
      return null;
  }
}

/** What applying the event did to patient_email_send; throws only on a real failure. */
async function applyToPatientEmail(client: PoolClient, event: WebhookEventPayload, tenant: string | null): Promise<EmailDeliveryOutcome> {
  const status = STATUS_BY_EVENT[event.type];
  if (!status || !("email_id" in event.data)) return "ignored_event";
  if (!tenant) return "no_tenant";
  const emailId = (event.data as { email_id: string }).email_id;
  if (!(await patientEmailSendExists(client, emailId))) return "unknown_email";
  const at = new Date(event.created_at);
  const moved = await applyPatientEmailStatus(client, emailId, status, statusDetail(event), Number.isNaN(at.getTime()) ? new Date() : at);
  return moved ? "applied" : "stale";
}

/**
 * CORE-213: the event is stored in webhook_event first — in its tenant's schema, or in
 * the default tenant's when it names none (every verified event is kept) — keyed by
 * the delivery id Resend repeats on every retry (svix-id). A delivery already
 * processed or skipped answers "duplicate" and changes nothing; a failed one is
 * re-applied. A failure rolls back only the apply (savepoint) and leaves the row
 * "failed" with its error, so the route answers 500 and Resend retries.
 */
export async function ApplyResendEventCommand(event: WebhookEventPayload, deliveryId: string): Promise<EmailDeliveryOutcome> {
  // Every Resend event has a data object; only email events carry tags (mailer.ts EmailTags).
  const tag = (event.data as { tags?: Record<string, string> }).tags?.tenant;
  const defaultTenant = tenantSlugFromHost("");
  const known = new Set([...(await getActiveTenantSlugs()), defaultTenant]);
  const tenant = tag && known.has(tag) ? tag : null;

  return withTenant(tenant ?? defaultTenant, async (client) => {
    const { row, fresh } = await claimWebhookEvent(client, { source: "resend", eventType: event.type, externalId: deliveryId, payload: event });
    if (!fresh && (row.status === "processed" || row.status === "skipped")) return "duplicate";

    await client.query("SAVEPOINT apply_webhook_event");
    try {
      const outcome = await applyToPatientEmail(client, event, tenant);
      await finishWebhookEvent(client, row.id, outcome === "applied" || outcome === "stale" ? "processed" : "skipped", outcome);
      return outcome;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT apply_webhook_event");
      await finishWebhookEvent(client, row.id, "failed", "failed", err instanceof Error ? err.message : String(err));
      console.error(`[webhooks/resend] event ${deliveryId} failed:`, err);
      return "failed";
    }
  });
}
