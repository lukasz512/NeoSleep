import { randomUUID } from "node:crypto";
import { hasOpenProblemReportWithPrefix, insertProblemReport } from "../db.js";
import { sendContactEmail } from "../mailer.js";
import { pwaBaseUrl } from "./issueNotifications.js";
import { notifyProblemReportCreated } from "./problemReportNotifications.js";

/**
 * CORE-173: a doctor whose login isn't linked to a practitioner record sees an
 * empty app. That is never the doctor's fault, so the system files the report
 * for them: a row in the admin Issues view, an in-app notice to every tenant
 * admin and an email to the team inbox. One open report per doctor; while it
 * stays open, further requests add nothing.
 */

export const DOCTOR_NOT_LINKED_PREFIX = "[auto:doctor-not-linked]";

/** Requests of one page load arrive together: skip the DB dedup for the rest of them. */
const RECENT_MS = 10 * 60 * 1000;
const recent = new Map<string, number>();

export function resetDoctorLinkAlertThrottle(): void {
  recent.clear();
}

export interface UnlinkedDoctor {
  tenantSlug: string;
  userId: string;
  email: string;
  name: string | null;
  requestId: string;
}

/** Best effort and never throws: the doctor's request already fails with 403 DOCTOR_NOT_LINKED. */
export async function reportUnlinkedDoctor(doctor: UnlinkedDoctor): Promise<void> {
  const key = `${doctor.tenantSlug}:${doctor.userId}`;
  const last = recent.get(key);
  if (last !== undefined && Date.now() - last < RECENT_MS) return;
  recent.set(key, Date.now());

  try {
    if (await hasOpenProblemReportWithPrefix(doctor.tenantSlug, doctor.userId, DOCTOR_NOT_LINKED_PREFIX)) return;

    const env = process.env.NODE_ENV ?? "development";
    const reportId = randomUUID();
    const who = doctor.name ? `${doctor.name} <${doctor.email}>` : doctor.email;
    const { number } = await insertProblemReport(reportId, {
      tenant_slug: doctor.tenantSlug,
      env,
      kind: "problem",
      description:
        `${DOCTOR_NOT_LINKED_PREFIX} Doctor ${who} cannot see any patients: their login is not linked to a ` +
        `practitioner record (users.identity_id has no practitioner row). Link the login to the doctor's ` +
        `practitioner record (same identity), then resolve this report.`,
      reporter_user_id: doctor.userId,
      reporter_name: doctor.name,
      reporter_email: doctor.email,
      reporter_role: "doctor",
      page_url: null,
      app_version: null,
      user_agent: null,
      viewport: null,
      request_ids: [doctor.requestId],
      recent_errors: null,
    });

    sendContactEmail(`[NeoSleep ${env}] URGENT Report #${number}: doctor sees no patients`, [
      ["Tenant", doctor.tenantSlug],
      ["Doctor", who],
      ["Cause", "Login not linked to a practitioner record"],
      ["Open", `${pwaBaseUrl()}/issues?report=${reportId}`],
    ]).catch((err) => console.error("doctor link alert email failed:", err));

    await notifyProblemReportCreated({
      tenantSlug: doctor.tenantSlug,
      reportId,
      number,
      reporterUserId: doctor.userId,
      reporterEmail: doctor.email,
      notifyReporter: false,
    });
  } catch (err) {
    // Let the next request try again rather than staying silent for 10 minutes.
    recent.delete(key);
    console.error(`doctor link alert for user ${doctor.userId} failed:`, err);
  }
}
