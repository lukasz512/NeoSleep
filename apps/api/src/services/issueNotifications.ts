import { DEPLOY_ENV, FRONTEND_URLS } from "../env.js";
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
 * Emails the platform inbox the first time a new API error kind (a 5xx) appears on prod.
 * Everything else reaches the inbox through the morning digest (CORE-190 D4).
 * Fire-and-forget: never throws, capped at 20 per hour per process.
 */
export function notifyNewErrorKind(row: DiagnosticInsert, result: DiagnosticWriteResult): void {
  const env = row.env ?? DEPLOY_ENV;
  if (!result.isNew || env !== "prod" || (row.source ?? "api") !== "api") return;
  if (row.level !== "error" && row.level !== "fatal") return;
  if (!takeErrorEmailSlot(Date.now())) return;

  const { subject, rows } = buildNewErrorEmail(row, DEPLOY_ENV, new Date());
  sendContactEmail(subject, rows).catch((e) => console.error("notifyNewErrorKind failed:", e));
}

const STACK_LINES_IN_EMAIL = 5;

function metaString(row: DiagnosticInsert, key: string): string | null {
  const value = row.metadata?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Subject and rows of the new-error email. Labelled with the deploy
 * environment (dev/prod), not NODE_ENV, which is "production" on both.
 * Carries what locates the error: component, page, app version, top of the stack.
 */
export function buildNewErrorEmail(
  row: DiagnosticInsert,
  deployEnv: string,
  now: Date
): { subject: string; rows: [string, string][] } {
  const where = metaString(row, "where") ?? metaString(row, "path") ?? "-";
  const stack = (row.stack ?? "").split("\n").filter(Boolean).slice(0, STACK_LINES_IN_EMAIL).join("\n");
  const rows: [string, string][] = [
    ["Message", row.message.slice(0, 300)],
    ["Source", row.source ?? "api"],
    ["Where", where],
    ["Component", metaString(row, "x_component") ?? "-"],
    ["Page", metaString(row, "url") ?? metaString(row, "path") ?? "-"],
    ["App version", metaString(row, "app_version") ?? "-"],
    ["Stack", stack || "-"],
    ["Tenant", row.tenant_slug ?? "-"],
    ["Request ID", row.request_id ?? "-"],
    ["First seen", now.toISOString()],
    ["Open", `${pwaBaseUrl()}/issues?tab=errors`],
  ];
  return { subject: `[NeoSleep ${deployEnv}] New error: ${row.message.slice(0, 80)}`, rows };
}
