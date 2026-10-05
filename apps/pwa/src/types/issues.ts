/** Shapes of the problem-report and diagnostics admin endpoints (see docs/stories/report-problem-and-admin-issues.md). */

export type ProblemKind = "problem" | "suggestion" | "other";
export type ProblemStatus = "new" | "in_progress" | "resolved" | "dismissed";
export type DiagnosticStatus = "open" | "resolved" | "dismissed";

export interface ProblemReport {
  id: string;
  number: number;
  tenant_slug: string | null;
  env: string | null;
  kind: ProblemKind;
  description: string;
  status: ProblemStatus;
  reporter_user_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_role: string | null;
  page_url: string | null;
  app_version: string | null;
  user_agent: string | null;
  viewport: string | null;
  request_ids: string[];
  recent_errors: Record<string, unknown>[] | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  has_attachment: boolean;
  admin_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagnosticGroup {
  id: string;
  level: "error" | "warn";
  message: string;
  stack: string | null;
  source: string;
  env: string | null;
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

export interface ProblemReportPatch {
  status?: ProblemStatus;
  admin_note?: string;
}
