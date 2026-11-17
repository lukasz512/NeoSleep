import { getDb } from "./connection.js";
import { inPlatformTransaction, insertPlatformAudit, type PlatformAuditActor } from "./platformAudit.js";

/** Platform-schema SQL for user problem reports and the admin errors list. */

export const PROBLEM_REPORT_KINDS = ["problem", "suggestion", "other"] as const;
export type ProblemReportKind = (typeof PROBLEM_REPORT_KINDS)[number];

export const PROBLEM_REPORT_STATUSES = ["new", "in_progress", "resolved", "dismissed"] as const;
export type ProblemReportStatus = (typeof PROBLEM_REPORT_STATUSES)[number];

export const DIAGNOSTIC_STATUSES = ["open", "resolved", "dismissed"] as const;
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number];

export interface ProblemReportInsert {
  tenant_slug: string;
  env: string;
  kind: ProblemReportKind;
  description: string;
  reporter_user_id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_role: string | null;
  page_url: string | null;
  app_version: string | null;
  user_agent: string | null;
  viewport: string | null;
  request_ids: string[];
  recent_errors: unknown[] | null;
}

/** Every column except attachment_path (storage internals), plus has_attachment. */
const PUBLIC_COLUMNS = `id, number, tenant_slug, env, kind, description, status,
  reporter_user_id, reporter_name, reporter_email, reporter_role, page_url, app_version,
  user_agent, viewport, request_ids, recent_errors, attachment_name, attachment_mime,
  attachment_size, admin_note, tracker_ref, reporter_reply, resolved_at, created_at, updated_at,
  (attachment_path IS NOT NULL) AS has_attachment`;

export interface ProblemReportRow {
  id: string;
  number: string;
  tenant_slug: string;
  env: string;
  kind: ProblemReportKind;
  description: string;
  status: ProblemReportStatus;
  reporter_user_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_role: string | null;
  page_url: string | null;
  app_version: string | null;
  user_agent: string | null;
  viewport: string | null;
  request_ids: string[];
  recent_errors: unknown[] | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  admin_note: string | null;
  tracker_ref: string | null;
  reporter_reply: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  has_attachment: boolean;
}

/**
 * What a reporter sees of their own report ("My reports"). No admin_note
 * (internal) and no captured context: they wrote the description themselves.
 */
export interface MyProblemReportRow {
  id: string;
  number: string;
  kind: ProblemReportKind;
  description: string;
  status: ProblemReportStatus;
  tracker_ref: string | null;
  reporter_reply: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function insertProblemReport(
  id: string,
  row: ProblemReportInsert
): Promise<{ id: string; number: number }> {
  const { rows } = await getDb().query<{ id: string; number: string }>(
    `INSERT INTO platform.problem_report
       (id, tenant_slug, env, kind, description, reporter_user_id, reporter_name, reporter_email,
        reporter_role, page_url, app_version, user_agent, viewport, request_ids, recent_errors)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id, number`,
    [
      id,
      row.tenant_slug,
      row.env,
      row.kind,
      row.description,
      row.reporter_user_id,
      row.reporter_name,
      row.reporter_email,
      row.reporter_role,
      row.page_url,
      row.app_version,
      row.user_agent,
      row.viewport,
      row.request_ids,
      row.recent_errors ? JSON.stringify(row.recent_errors) : null,
    ]
  );
  const created = rows[0]!;
  return { id: created.id, number: Number(created.number) };
}

export async function setProblemReportAttachment(
  id: string,
  attachment: { path: string; name: string; mime: string; size: number }
): Promise<void> {
  await getDb().query(
    `UPDATE platform.problem_report
        SET attachment_path = $2, attachment_name = $3, attachment_mime = $4, attachment_size = $5
      WHERE id = $1`,
    [id, attachment.path, attachment.name, attachment.mime, attachment.size]
  );
}

/**
 * The fix an error kind is tracked by on the board: 'diag:<source>:<hash>' is the ticket's
 * external_ref (CORE-190). Legacy 'production' rows never have one: the archive is view only (CORE-227).
 */
const TICKET_OF_DIAGNOSTIC = `d.env <> 'production' AND i.external_ref = 'diag:' || d.source || ':' || d.message_hash`;

/**
 * The worker leaves a blocked ticket in Building with a comment that starts with "Blocked:".
 * It counts while it is newer than the ticket's last move; this is its first line.
 */
const BLOCKED_REASON = `(
  SELECT left(btrim(split_part(substr(e.body, 9), E'\\n', 1)), 200)
    FROM platform.work_item_event e
   WHERE e.item_id = i.id AND e.kind = 'comment' AND e.body LIKE 'Blocked:%'
     AND i.status = 'building' AND e.created_at >= i.status_changed_at
   ORDER BY e.created_at DESC, e.id DESC
   LIMIT 1)`;

/** The newest link of one kind on the ticket (links keep the order they were added in). */
function lastLinkOfKind(kind: "artifact" | "pr"): string {
  return `(SELECT l.link ->> 'url'
             FROM jsonb_array_elements(i.links) WITH ORDINALITY AS l(link, position)
            WHERE l.link ->> 'kind' = '${kind}'
            ORDER BY l.position DESC
            LIMIT 1)`;
}

/** What a tenant admin may know about the error behind a report: its state, not the ticket. */
export interface LinkedErrorState {
  status: DiagnosticStatus;
  ticket_status: string | null;
  blocked: boolean;
}

export type ProblemReportListRow = ProblemReportRow & { linked_error: LinkedErrorState | null };

export async function listProblemReports(tenantSlug: string, status: ProblemReportStatus | null): Promise<ProblemReportListRow[]> {
  const { rows } = await getDb().query<ProblemReportListRow>(
    `SELECT ${PUBLIC_COLUMNS},
            (SELECT json_build_object('status', d.status, 'ticket_status', i.status, 'blocked', ${BLOCKED_REASON} IS NOT NULL)
               FROM platform.diagnostics d
               LEFT JOIN platform.work_item i ON ${TICKET_OF_DIAGNOSTIC}
              WHERE d.request_id = ANY (r.request_ids)
              ORDER BY d.last_seen DESC
              LIMIT 1) AS linked_error
       FROM platform.problem_report r
      WHERE tenant_slug = $1 AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC
      LIMIT 200`,
    [tenantSlug, status]
  );
  return rows;
}

export interface ProblemReportPatch {
  status?: ProblemReportStatus;
  admin_note?: string | null;
  tracker_ref?: string | null;
  reporter_reply?: string | null;
}

/**
 * The updated row plus the status it had before, so the caller can tell a real transition.
 * A status change leaves a platform.audit row (before → after) in the same transaction (CORE-227).
 */
export async function updateProblemReport(
  tenantSlug: string,
  id: string,
  patch: ProblemReportPatch,
  actor: PlatformAuditActor
): Promise<{ row: ProblemReportRow; previousStatus: ProblemReportStatus } | null> {
  return inPlatformTransaction(async (client) => {
    const { rows } = await client.query<ProblemReportRow & { previous_status: ProblemReportStatus }>(
      `WITH prev AS (
         SELECT status AS previous_status FROM platform.problem_report WHERE id = $1 AND tenant_slug = $2 FOR UPDATE
       )
       UPDATE platform.problem_report
          SET status         = COALESCE($3, status),
              admin_note     = CASE WHEN $4 THEN $5 ELSE admin_note END,
              tracker_ref    = CASE WHEN $6 THEN $7 ELSE tracker_ref END,
              reporter_reply = CASE WHEN $8 THEN $9 ELSE reporter_reply END,
              resolved_at    = CASE
                                 WHEN COALESCE($3, status) = 'resolved' THEN COALESCE(resolved_at, now())
                                 ELSE NULL
                               END,
              updated_at     = now()
         FROM prev
        WHERE id = $1 AND tenant_slug = $2
        RETURNING ${PUBLIC_COLUMNS}, prev.previous_status`,
      [
        id,
        tenantSlug,
        patch.status ?? null,
        patch.admin_note !== undefined,
        patch.admin_note ?? null,
        patch.tracker_ref !== undefined,
        patch.tracker_ref ?? null,
        patch.reporter_reply !== undefined,
        patch.reporter_reply ?? null,
      ]
    );
    const updated = rows[0];
    if (!updated) return null;
    const { previous_status: previousStatus, ...row } = updated;
    if (row.status !== previousStatus) {
      await insertPlatformAudit(client, actor, {
        action: "problem_report.status",
        targetType: "problem_report",
        targetId: id,
        before: { status: previousStatus },
        after: { status: row.status },
      });
    }
    return { row, previousStatus };
  });
}

/** The signed-in user's own reports in this tenant, newest first. */
export async function listMyProblemReports(tenantSlug: string, reporterUserId: string): Promise<MyProblemReportRow[]> {
  const { rows } = await getDb().query<MyProblemReportRow>(
    `SELECT id, number, kind, description, status, tracker_ref, reporter_reply, resolved_at, created_at, updated_at
       FROM platform.problem_report
      WHERE tenant_slug = $1 AND reporter_user_id = $2
      ORDER BY created_at DESC
      LIMIT 100`,
    [tenantSlug, reporterUserId]
  );
  return rows;
}

export async function getProblemReportAttachmentPath(tenantSlug: string, id: string): Promise<string | null> {
  const { rows } = await getDb().query<{ attachment_path: string | null }>(
    `SELECT attachment_path FROM platform.problem_report WHERE id = $1 AND tenant_slug = $2`,
    [id, tenantSlug]
  );
  return rows[0]?.attachment_path ?? null;
}

export interface DiagnosticListRow {
  id: string;
  level: string;
  message: string;
  stack: string | null;
  source: string;
  env: string;
  tenant_slug: string | null;
  user_id: string | null;
  request_id: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
  status: DiagnosticStatus;
  metadata: Record<string, unknown> | null;
  linked_reports: { id: string; number: number }[];
  ticket: DiagnosticTicket | null;
}

/** The board ticket that tracks the fix of an error kind, as the Issues screen needs it (CORE-227). */
export interface DiagnosticTicket {
  key: string;
  status: string;
  branch: string | null;
  status_changed_at: string;
  artifact_url: string | null;
  /** The pull request or the pre-filled compare page, once the branch is pushed. */
  pr_url: string | null;
  blocked_reason: string | null;
}

export async function listDiagnostics(filter: {
  status: DiagnosticStatus | null;
  env: string | null;
  level: string | null;
}): Promise<DiagnosticListRow[]> {
  const { rows } = await getDb().query<DiagnosticListRow>(
    `SELECT d.id, d.level, d.message, d.stack, d.source, d.env, d.tenant_slug, d.user_id, d.request_id,
            d.count, d.first_seen, d.last_seen, d.status, d.metadata,
            COALESCE((
              SELECT json_agg(json_build_object('id', r.id, 'number', r.number) ORDER BY r.number)
                FROM platform.problem_report r
               WHERE d.request_id IS NOT NULL AND d.request_id = ANY (r.request_ids)
            ), '[]'::json) AS linked_reports,
            t.ticket
       FROM platform.diagnostics d
       LEFT JOIN LATERAL (
         SELECT json_build_object(
                  'key', i.team_key || '-' || i.number,
                  'status', i.status,
                  'branch', i.branch,
                  'status_changed_at', i.status_changed_at,
                  'artifact_url', ${lastLinkOfKind("artifact")},
                  'pr_url', ${lastLinkOfKind("pr")},
                  'blocked_reason', ${BLOCKED_REASON}
                ) AS ticket
           FROM platform.work_item i
          WHERE ${TICKET_OF_DIAGNOSTIC}
       ) t ON true
      WHERE ($1::text IS NULL OR d.status = $1)
        AND ($2::text IS NULL OR d.env = $2)
        AND ($3::text IS NULL OR d.level = $3)
      ORDER BY d.last_seen DESC
      LIMIT 200`,
    [filter.status, filter.env, filter.level]
  );
  return rows;
}

/** Moves the error ticket and leaves a platform.audit row (before → after) in the same transaction (CORE-213). */
export async function setDiagnosticStatus(
  id: string,
  status: DiagnosticStatus,
  actor: PlatformAuditActor
): Promise<{ id: string; status: DiagnosticStatus } | null> {
  return inPlatformTransaction(async (client) => {
    const before = await client.query<{ status: DiagnosticStatus }>(`SELECT status FROM platform.diagnostics WHERE id = $1 FOR UPDATE`, [id]);
    if (!before.rows[0]) return null;
    const { rows } = await client.query<{ id: string; status: DiagnosticStatus }>(
      `UPDATE platform.diagnostics SET status = $2 WHERE id = $1 RETURNING id, status`,
      [id, status]
    );
    await insertPlatformAudit(client, actor, {
      action: "diagnostic.status",
      targetType: "diagnostic",
      targetId: id,
      before: { status: before.rows[0].status },
      after: { status },
    });
    return rows[0] ?? null;
  });
}

/** Is there still an open (new / in progress) report from this user whose description starts with `prefix`? Dedups automatic reports (CORE-173). */
export async function hasOpenProblemReportWithPrefix(
  tenantSlug: string,
  reporterUserId: string,
  prefix: string
): Promise<boolean> {
  const { rows } = await getDb().query<{ open: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM platform.problem_report
        WHERE tenant_slug = $1 AND reporter_user_id = $2
          AND status IN ('new', 'in_progress')
          AND left(description, length($3)) = $3
     ) AS open`,
    [tenantSlug, reporterUserId, prefix]
  );
  return rows[0]?.open ?? false;
}
