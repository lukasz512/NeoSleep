import type { PoolClient } from "pg";
import { withTenant, type ProblemReportRow, type ProblemReportStatus } from "../db.js";
import { getIdentityIdForUser } from "../db/notification.js";
import { DatabaseError } from "../errors.js";
import { notify } from "../notifications/notify.js";
import type { NotificationType } from "../notifications/catalog.js";
import { sendProblemReportEmail, type EmailRecipient, type ProblemReportEmailKind } from "../mailer.js";
import { pwaBaseUrl } from "./issueNotifications.js";

/**
 * Trackable reports (docs/stories/trackable-feedback-reports.md): the reporter
 * always gets a receipt and hears how the report ended, so nothing they send
 * vanishes without a trace.
 *
 *   created          reporter: in-app + email receipt; tenant admins: in-app
 *   → in_progress    reporter: in-app only (D3)
 *   → resolved       reporter: in-app + email with ticket and reply (D3)
 *   → dismissed      same, as "won't fix"
 *
 * Best effort: the report is already stored, so a failure here is logged and
 * never undoes or fails the request (same discipline as deviceOrders.ts).
 */

interface Reporter extends EmailRecipient {
  identityId: string;
  email: string | null;
}

async function getReporter(client: PoolClient, userId: string): Promise<Reporter | null> {
  try {
    const { rows } = await client.query<{
      identity_id: string;
      email: string | null;
      title: string | null;
      first_name: string | null;
      last_name: string | null;
      language: string | null;
      region: string | null;
    }>(
      `SELECT i.id AS identity_id, i.email, i.title, i.first_name, i.last_name, i.language, i.region
         FROM users u JOIN identities i ON i.id = u.identity_id
        WHERE u.id = $1`,
      [userId]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      identityId: r.identity_id,
      email: r.email,
      title: r.title,
      firstName: r.first_name,
      lastName: r.last_name,
      language: r.language,
      region: r.region,
    };
  } catch (err) {
    throw new DatabaseError("getReporter", err);
  }
}

/** Only the tenant admins: the Issues view is admin-only. */
async function getActiveAdminIdentityIds(client: PoolClient): Promise<string[]> {
  try {
    const { rows } = await client.query<{ identity_id: string }>(
      `SELECT DISTINCT u.identity_id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'admin'
        WHERE u.deleted_at IS NULL AND u.status = 'active'`
    );
    return rows.map((r) => r.identity_id);
  } catch (err) {
    throw new DatabaseError("getActiveAdminIdentityIds", err);
  }
}

function myReportLink(reportId: string): string {
  return `${pwaBaseUrl()}/my-reports?report=${encodeURIComponent(reportId)}`;
}

async function emailReporter(
  reporter: Reporter | null,
  fallbackEmail: string | null,
  kind: ProblemReportEmailKind,
  report: { id: string; number: number | string; trackerRef: string | null; reply: string | null }
): Promise<void> {
  const to = reporter?.email ?? fallbackEmail;
  if (!to) return;
  await sendProblemReportEmail(to, reporter ?? {}, {
    kind,
    number: report.number,
    trackerRef: report.trackerRef,
    reply: report.reply,
    link: myReportLink(report.id),
  });
}

export async function notifyProblemReportCreated(input: {
  tenantSlug: string;
  reportId: string;
  number: number;
  reporterUserId: string;
  reporterEmail: string | null;
  /** false for a report the system filed on the user's behalf (CORE-173): admins only, no receipt. */
  notifyReporter?: boolean;
}): Promise<void> {
  const notifyReporter = input.notifyReporter ?? true;
  try {
    const reporter = await withTenant(input.tenantSlug, async (client) => {
      const found = await getReporter(client, input.reporterUserId);
      const reporterIdentityId = found?.identityId ?? (await getIdentityIdForUser(client, input.reporterUserId));
      const meta = { number: input.number };
      if (notifyReporter && reporterIdentityId) {
        await notify(client, { type: "problem_report_received", recipients: [reporterIdentityId], entityId: input.reportId, meta });
      }
      await notify(client, {
        type: "problem_report_new",
        recipients: await getActiveAdminIdentityIds(client),
        entityId: input.reportId,
        meta,
        actorIdentityId: reporterIdentityId,
      });
      return found;
    });
    if (notifyReporter) await emailReporter(reporter, input.reporterEmail, "received", {
      id: input.reportId,
      number: input.number,
      trackerRef: null,
      reply: null,
    });
  } catch (err) {
    console.error(`problem report #${input.number}: reporter/admin notification failed:`, err);
  }
}

const STATUS_NOTIFICATION: Partial<Record<ProblemReportStatus, { type: NotificationType; email: ProblemReportEmailKind | null }>> = {
  in_progress: { type: "problem_report_in_progress", email: null },
  resolved: { type: "problem_report_closed", email: "resolved" },
  dismissed: { type: "problem_report_closed", email: "dismissed" },
};

/** After an admin's PATCH: tells the reporter only when the status really changed. */
export async function notifyProblemReportStatusChanged(input: {
  tenantSlug: string;
  row: ProblemReportRow;
  previousStatus: ProblemReportStatus;
  actorUserId: string;
}): Promise<void> {
  const { row } = input;
  const plan = row.status !== input.previousStatus ? STATUS_NOTIFICATION[row.status] : undefined;
  if (!plan || !row.reporter_user_id) return;
  const reporterUserId = row.reporter_user_id;
  try {
    const reporter = await withTenant(input.tenantSlug, async (client) => {
      const found = await getReporter(client, reporterUserId);
      if (found) {
        await notify(client, {
          type: plan.type,
          recipients: [found.identityId],
          entityId: row.id,
          meta: { number: Number(row.number), status: row.status, trackerRef: row.tracker_ref },
          actorIdentityId: await getIdentityIdForUser(client, input.actorUserId),
        });
      }
      return found;
    });
    if (plan.email) {
      await emailReporter(reporter, row.reporter_email, plan.email, {
        id: row.id,
        number: row.number,
        trackerRef: row.tracker_ref,
        reply: row.reporter_reply,
      });
    }
  } catch (err) {
    console.error(`problem report #${row.number}: status notification failed:`, err);
  }
}
