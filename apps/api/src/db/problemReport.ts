import { getDb } from "./connection.js";

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
  attachment_size, admin_note, resolved_at, created_at, updated_at,
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
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  has_attachment: boolean;
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

export async function listProblemReports(tenantSlug: string, status: ProblemReportStatus | null): Promise<ProblemReportRow[]> {
  const { rows } = await getDb().query<ProblemReportRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM platform.problem_report
      WHERE tenant_slug = $1 AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC
      LIMIT 200`,
    [tenantSlug, status]
  );
  return rows;
}

export async function updateProblemReport(
  tenantSlug: string,
  id: string,
  patch: { status?: ProblemReportStatus; admin_note?: string | null }
): Promise<ProblemReportRow | null> {
  const { rows } = await getDb().query<ProblemReportRow>(
    `UPDATE platform.problem_report
        SET status      = COALESCE($3, status),
            admin_note  = CASE WHEN $4 THEN $5 ELSE admin_note END,
            resolved_at = CASE
                            WHEN COALESCE($3, status) = 'resolved' THEN COALESCE(resolved_at, now())
                            ELSE NULL
                          END,
            updated_at  = now()
      WHERE id = $1 AND tenant_slug = $2
      RETURNING ${PUBLIC_COLUMNS}`,
    [id, tenantSlug, patch.status ?? null, patch.admin_note !== undefined, patch.admin_note ?? null]
  );
  return rows[0] ?? null;
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
            ), '[]'::json) AS linked_reports
       FROM platform.diagnostics d
      WHERE ($1::text IS NULL OR d.status = $1)
        AND ($2::text IS NULL OR d.env = $2)
        AND ($3::text IS NULL OR d.level = $3)
      ORDER BY d.last_seen DESC
      LIMIT 200`,
    [filter.status, filter.env, filter.level]
  );
  return rows;
}

export async function setDiagnosticStatus(id: string, status: DiagnosticStatus): Promise<{ id: string; status: DiagnosticStatus } | null> {
  const { rows } = await getDb().query<{ id: string; status: DiagnosticStatus }>(
    `UPDATE platform.diagnostics SET status = $2 WHERE id = $1 RETURNING id, status`,
    [id, status]
  );
  return rows[0] ?? null;
}
