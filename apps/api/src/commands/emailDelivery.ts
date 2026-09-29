import type { WebhookEventPayload } from "resend";
import { withTenant, getActiveTenantSlugs, tenantSlugFromHost } from "../db/tenant.js";
import { applyPatientEmailStatus, patientEmailSendExists, type PatientEmailStatus } from "../db/patientEmailSend.js";

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

export type EmailDeliveryOutcome = "applied" | "ignored_event" | "no_tenant" | "unknown_email" | "stale";

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

export async function ApplyResendEventCommand(event: WebhookEventPayload): Promise<EmailDeliveryOutcome> {
  const status = STATUS_BY_EVENT[event.type];
  if (!status || !("email_id" in event.data)) return "ignored_event";
  const data = event.data as { email_id: string; tags?: Record<string, string> };

  const tenant = data.tags?.tenant;
  const known = new Set([...(await getActiveTenantSlugs()), tenantSlugFromHost("")]);
  if (!tenant || !known.has(tenant)) return "no_tenant";

  const at = new Date(event.created_at);
  const applied = await withTenant(tenant, async (client) => {
    if (!(await patientEmailSendExists(client, data.email_id))) return "unknown_email" as const;
    const moved = await applyPatientEmailStatus(client, data.email_id, status, statusDetail(event), Number.isNaN(at.getTime()) ? new Date() : at);
    return moved ? ("applied" as const) : ("stale" as const);
  });
  return applied;
}
