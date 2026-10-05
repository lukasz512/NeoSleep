import { FRONTEND_URLS } from "../env.js";
import { sendContactEmail } from "../mailer.js";
import type { DiagnosticInsert, DiagnosticWriteResult } from "../db.js";

/** Internal emails about new errors and new user reports (platform team inbox, not tenant users). */

const MAX_ERROR_EMAILS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;
let errorEmailTimes: number[] = [];

/** First PWA origin from FRONTEND_URL (which may be a comma-separated list). */
export function pwaBaseUrl(): string {
  return (FRONTEND_URLS[0] ?? "http://localhost:5173").replace(/\/+$/, "");
}

/** Test hook: forget the in-memory email budget. */
export function resetErrorEmailBudget(): void {
  errorEmailTimes = [];
}

function takeErrorEmailSlot(now: number): boolean {
  errorEmailTimes = errorEmailTimes.filter((t) => now - t < HOUR_MS);
  if (errorEmailTimes.length >= MAX_ERROR_EMAILS_PER_HOUR) return false;
  errorEmailTimes.push(now);
  return true;
}

/**
 * Emails the platform inbox the first time a new error kind appears on
 * production. Fire-and-forget: never throws, capped at 20 per hour per process.
 */
export function notifyNewErrorKind(row: DiagnosticInsert, result: DiagnosticWriteResult): void {
  const env = row.env ?? process.env.NODE_ENV ?? "development";
  if (!result.isNew || env !== "production") return;
  if (row.level !== "error" && row.level !== "fatal") return;
  if (!takeErrorEmailSlot(Date.now())) return;

  const where = typeof row.metadata?.where === "string" ? row.metadata.where : typeof row.metadata?.path === "string" ? row.metadata.path : "-";
  const rows: [string, string][] = [
    ["Message", row.message.slice(0, 300)],
    ["Source", row.source ?? "api"],
    ["Where", where],
    ["Tenant", row.tenant_slug ?? "-"],
    ["Request ID", row.request_id ?? "-"],
    ["First seen", new Date().toISOString()],
    ["Open", `${pwaBaseUrl()}/issues?tab=errors`],
  ];
  sendContactEmail(`[NeoSleep ${env}] New error: ${row.message.slice(0, 80)}`, rows).catch((e) =>
    console.error("notifyNewErrorKind failed:", e)
  );
}
