import { getDb } from "../db/connection.js";
import type { DiagnosticInsert, DiagnosticWriteResult } from "../db/diagnostic.js";
import { normaliseDiagnosticMessage } from "../db/diagnostic.js";
import {
  addWorkItemComment,
  createWorkItem,
  getWorkItemByExternalRef,
  updateWorkItem,
  type WorkActor,
  type WorkItemRow,
  type WorkStatus,
} from "../db/workBoard.js";
import { sendContactEmail } from "../mailer.js";
import { pwaBaseUrl } from "./issueNotifications.js";

/**
 * App errors become work-board tickets (CORE-190, docs/stories/errors-to-board-tickets.md,
 * decisions core190-r1). One error kind (source + message hash) is one ticket:
 * - prod with a stack → `approved`, so the nightly worker takes it (D1); anything else → `triage`;
 * - dev errors carry the `dev` label and the lowest priority (D2);
 * - a repeat changes nothing on the board; a closed ticket whose error comes back reopens;
 * - priority follows the number of affected users, refreshed by the morning digest (D3, D4).
 */

export const ERROR_LABEL = "auto-error";
export const DEV_LABEL = "dev";
export const ERROR_TRACKER: WorkActor = { name: "error-tracker", kind: "agent" };
const MAX_NEW_TICKETS_PER_HOUR = 10;
const TICKET_ENVS = new Set(["prod", "dev"]);
const CLOSED: readonly WorkStatus[] = ["done", "canceled"];
const BODY_LIMIT = 1500;

export interface ErrorTicketOptions {
  /** Board team the tickets go to; tests use their own. */
  team?: string;
}

export type ErrorTicketAction = "skipped" | "created" | "unchanged" | "reopened" | "escalated" | "flood";

export interface ErrorTicketResult {
  action: ErrorTicketAction;
  key?: string;
}

/**
 * Removes what could identify a person or a session before text reaches the board:
 * emails, JWTs and bearer tokens, UUIDs, phone numbers, long digit runs and URL query strings.
 */
export function scrubForTicket(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>")
    .replace(/\bBearer\s+[\w.~+/=-]+/gi, "Bearer <token>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/(https?:\/\/[^\s?#"')]+)\?[^\s#"')]*/g, "$1?<query>")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "<number>")
    .replace(/\d{6,}/g, "<number>");
}

/** `diag:<source>:<hash>` — the same bug on dev and prod is one ticket. */
export function errorTicketRef(source: string, hash: string): string {
  return `diag:${source}:${hash}`;
}

function httpStatusOf(row: DiagnosticInsert): number | null {
  const status = row.metadata?.status;
  return typeof status === "number" ? status : typeof status === "string" && /^\d{3}$/.test(status) ? Number(status) : null;
}

/** A 4xx is the app saying no (validation, auth, not found), not a bug. */
export function isClientRejection(row: DiagnosticInsert): boolean {
  const status = httpStatusOf(row);
  return status !== null && status >= 400 && status < 500;
}

function targetStatus(env: string, row: DiagnosticInsert): WorkStatus {
  return env === "prod" && row.stack ? "approved" : "triage";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ticketText(env: string, row: DiagnosticInsert): { title: string; problem: string; change: string; done_when: string } {
  const where = typeof row.metadata?.where === "string" ? row.metadata.where : typeof row.metadata?.path === "string" ? row.metadata.path : "-";
  const frames = String(row.stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join("\n");
  const change = "Reproduce it as a failing test first, then fix the cause and keep the test.";
  const done_when = "The regression test passes, and the error has no new hits for 7 days after the fix is deployed.";
  const header = [
    `Error: ${clip(scrubForTicket(row.message), 400)}`,
    `Env: ${env} · source: ${row.source ?? "api"} · where: ${scrubForTicket(where)} · level: ${row.level}`,
    `First seen: ${new Date().toISOString()}`,
    `All hits: ${pwaBaseUrl()}/issues?tab=errors`,
  ].join("\n");
  const room = BODY_LIMIT - header.length - change.length - done_when.length - 20;
  const problem = frames && room > 80 ? `${header}\n\nTop frames:\n${clip(scrubForTicket(frames), room)}` : header;
  return {
    title: clip(`Error: ${scrubForTicket(normaliseDiagnosticMessage(row.message))}`, 200),
    problem,
    change,
    done_when,
  };
}

async function newTicketsLastHour(team: string): Promise<number> {
  const { rows } = await getDb().query<{ n: string }>(
    `SELECT count(*) AS n FROM platform.work_item
      WHERE team_key = $1 AND source = 'error' AND external_ref LIKE 'diag:%' AND created_at > now() - interval '1 hour'`,
    [team]
  );
  return Number(rows[0]?.n ?? 0);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";
}

/** Over the hourly cap, one "Error flood" ticket per hour collects the rest as comments. */
async function recordFlood(team: string, env: string, row: DiagnosticInsert): Promise<ErrorTicketResult> {
  const hour = new Date().toISOString().slice(0, 13);
  const ref = `flood:${team}:${hour}`;
  let item = await getWorkItemByExternalRef(ref);
  if (!item) {
    try {
      item = await createWorkItem(
        {
          team,
          title: `Error flood ${hour}:00 UTC: more than ${MAX_NEW_TICKETS_PER_HOUR} new error kinds in one hour`,
          problem: "Usually one broken deploy. Each comment below is an error kind that got no ticket of its own.",
          status: "triage",
          priority: 1,
          labels: [ERROR_LABEL],
          source: "error",
          external_ref: ref,
        },
        ERROR_TRACKER
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      item = await getWorkItemByExternalRef(ref);
    }
  }
  if (!item) return { action: "skipped" };
  await addWorkItemComment(item.team_key, item.number, clip(`[${env}] ${scrubForTicket(row.message)}`, 500), ERROR_TRACKER);
  return { action: "flood", key: item.key };
}

async function updateExisting(item: WorkItemRow, env: string, row: DiagnosticInsert): Promise<ErrorTicketResult> {
  if (CLOSED.includes(item.status)) {
    const labels = env === "prod" ? item.labels.filter((l) => l !== DEV_LABEL) : item.labels;
    await updateWorkItem(item.team_key, item.number, { status: targetStatus(env, row), labels }, ERROR_TRACKER);
    await addWorkItemComment(
      item.team_key,
      item.number,
      `Regressed: seen again on ${env} at ${new Date().toISOString()} after the ticket was ${item.status}.`,
      ERROR_TRACKER
    );
    return { action: "reopened", key: item.key };
  }
  if (env === "prod" && item.labels.includes(DEV_LABEL)) {
    const status = item.status === "triage" ? targetStatus(env, row) : item.status;
    await updateWorkItem(
      item.team_key,
      item.number,
      { status, labels: item.labels.filter((l) => l !== DEV_LABEL), priority: Math.min(item.priority || 3, 3) },
      ERROR_TRACKER
    );
    await addWorkItemComment(item.team_key, item.number, "Now also seen on prod.", ERROR_TRACKER);
    return { action: "escalated", key: item.key };
  }
  return { action: "unchanged", key: item.key };
}

/**
 * Opens, reopens or escalates the ticket for one recorded diagnostic. Throws on DB errors;
 * callers use `queueErrorTicket`, which never does.
 */
export async function syncErrorTicket(
  row: DiagnosticInsert,
  result: DiagnosticWriteResult,
  options: ErrorTicketOptions = {}
): Promise<ErrorTicketResult> {
  const env = row.env ?? "";
  if (!result.id || !result.hash) return { action: "skipped" };
  if (row.level !== "error" && row.level !== "fatal") return { action: "skipped" };
  if (!TICKET_ENVS.has(env) || isClientRejection(row)) return { action: "skipped" };

  const team = options.team ?? "CORE";
  const ref = errorTicketRef(row.source ?? "api", result.hash);
  const existing = await getWorkItemByExternalRef(ref);
  if (existing) return updateExisting(existing, env, row);

  if ((await newTicketsLastHour(team)) >= MAX_NEW_TICKETS_PER_HOUR) return recordFlood(team, env, row);
  try {
    const item = await createWorkItem(
      {
        team,
        ...ticketText(env, row),
        status: targetStatus(env, row),
        priority: env === "prod" ? 3 : 4,
        labels: env === "prod" ? [ERROR_LABEL] : [ERROR_LABEL, DEV_LABEL],
        source: "error",
        external_ref: ref,
      },
      ERROR_TRACKER
    );
    return { action: "created", key: item.key };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // A parallel request opened it a moment ago.
    const raced = await getWorkItemByExternalRef(ref);
    return raced ? updateExisting(raced, env, row) : { action: "skipped" };
  }
}

/** Fire-and-forget wrapper for request paths: a board problem must never break error reporting. */
export function queueErrorTicket(row: DiagnosticInsert, result: DiagnosticWriteResult): void {
  syncErrorTicket(row, result).catch((err) => console.error("syncErrorTicket failed:", err));
}

/** Priority from distinct affected users: ≥10 → 1, ≥3 → 2, otherwise 3. Dev-only tickets stay 4. */
export function priorityForUsers(users: number, devOnly: boolean): number {
  if (devOnly) return 4;
  if (users >= 10) return 1;
  if (users >= 3) return 2;
  return 3;
}

interface OpenErrorTicket {
  team_key: string;
  number: number;
  key: string;
  title: string;
  priority: number;
  labels: string[];
  hits: string | null;
  users: string | null;
  last_seen: string | null;
}

export interface ErrorDigest {
  created: { key: string; title: string; status: WorkStatus }[];
  fixed: { key: string; title: string }[];
  active: { key: string; title: string; hits: number; users: number }[];
  emailed: boolean;
}

/**
 * Morning digest (D4): new error tickets, what the night moved to Needs Review, and one
 * counter comment per open ticket that had hits since the last run. Also refreshes priorities.
 */
export async function runErrorDigest(options: ErrorTicketOptions & { sinceHours?: number; email?: boolean } = {}): Promise<ErrorDigest> {
  const team = options.team ?? "CORE";
  const since = new Date(Date.now() - (options.sinceHours ?? 24) * 3600_000);
  const db = getDb();

  const created = (
    await db.query<{ key: string; title: string; status: WorkStatus }>(
      `SELECT team_key || '-' || number AS key, title, status FROM platform.work_item
        WHERE team_key = $1 AND source = 'error' AND external_ref LIKE 'diag:%' AND created_at >= $2
        ORDER BY created_at`,
      [team, since]
    )
  ).rows;

  const fixed = (
    await db.query<{ key: string; title: string }>(
      `SELECT DISTINCT i.team_key || '-' || i.number AS key, i.title FROM platform.work_item i
         JOIN platform.work_item_event e ON e.item_id = i.id
        WHERE i.team_key = $1 AND $3 = ANY(i.labels) AND e.kind = 'status' AND e.to_status = 'needs_review'
          AND e.created_at >= $2`,
      [team, since, ERROR_LABEL]
    )
  ).rows;

  const open = (
    await db.query<OpenErrorTicket>(
      `SELECT i.team_key, i.number, i.team_key || '-' || i.number AS key, i.title, i.priority, i.labels,
              (SELECT sum(d.count) FROM platform.diagnostics d
                WHERE d.source = split_part(i.external_ref, ':', 2) AND d.message_hash = split_part(i.external_ref, ':', 3)) AS hits,
              (SELECT count(DISTINCT u.user_hash) FROM platform.diagnostic_user u
                WHERE u.message_hash = split_part(i.external_ref, ':', 3)) AS users,
              (SELECT max(d.last_seen) FROM platform.diagnostics d
                WHERE d.source = split_part(i.external_ref, ':', 2) AND d.message_hash = split_part(i.external_ref, ':', 3)) AS last_seen
         FROM platform.work_item i
        WHERE i.team_key = $1 AND i.source = 'error' AND i.external_ref LIKE 'diag:%'
          AND i.status NOT IN ('done', 'canceled')`,
      [team]
    )
  ).rows;

  const active: ErrorDigest["active"] = [];
  for (const t of open) {
    const hits = Number(t.hits ?? 0);
    const users = Number(t.users ?? 0);
    const priority = priorityForUsers(users, t.labels.includes(DEV_LABEL));
    if (priority !== t.priority) await updateWorkItem(t.team_key, t.number, { priority }, ERROR_TRACKER);
    if (t.last_seen && new Date(t.last_seen) >= since) {
      active.push({ key: t.key, title: t.title, hits, users });
      await addWorkItemComment(t.team_key, t.number, `Daily: ${hits} hits in total, ${users} users affected, last seen ${new Date(t.last_seen).toISOString()}.`, ERROR_TRACKER);
    }
  }

  let emailed = false;
  if (options.email !== false && (created.length || fixed.length || active.length)) {
    const board = `${pwaBaseUrl()}/platform/board`;
    const lines = (items: { key: string; title: string }[]) => items.map((i) => `${i.key} ${clip(i.title, 90)}`).join("\n") || "-";
    await sendContactEmail(`[NeoSleep] Errors this morning: ${created.length} new, ${fixed.length} fixed overnight`, [
      ["New tickets", lines(created)],
      ["Fixed overnight (Needs Review)", lines(fixed)],
      ["Still happening", active.map((a) => `${a.key} ${a.hits} hits, ${a.users} users`).join("\n") || "-"],
      ["Board", board],
    ]);
    emailed = true;
  }
  return { created, fixed, active, emailed };
}
