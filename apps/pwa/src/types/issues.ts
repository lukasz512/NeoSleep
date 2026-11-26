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
  /** The ticket it was filed under (e.g. CORE-123), typed in by an admin. */
  tracker_ref: string | null;
  /** PHI-free reply the reporter reads (and gets by email when the report is closed). */
  reporter_reply: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  /** State of the error this report is linked to by request id; only the list endpoint sends it. */
  linked_error?: LinkedErrorState | null;
}

export interface LinkedErrorState {
  status: DiagnosticStatus;
  ticket_status: string | null;
  blocked: boolean;
}

/** The board ticket that tracks the fix of an error kind. */
export interface DiagnosticTicket {
  key: string;
  status: string;
  branch: string | null;
  status_changed_at: string;
  artifact_url: string | null;
  /** The pull request or the pre-filled compare page, once the branch is pushed. */
  pr_url: string | null;
  /** First line of the worker's "Blocked:" comment while the ticket waits in Building. */
  blocked_reason: string | null;
}

/** prod and dev are what the API writes today; archive is the legacy "production" label, view only. */
export type DiagnosticEnv = "prod" | "dev" | "archive";

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
  ticket: DiagnosticTicket | null;
}

export interface ProblemReportPatch {
  status?: ProblemStatus;
  admin_note?: string;
  tracker_ref?: string | null;
  reporter_reply?: string | null;
}

/** What a reporter sees of their own report (GET /problem-reports/mine): no internal note, no context. */
export interface MyProblemReport {
  id: string;
  number: number;
  kind: ProblemKind;
  description: string;
  status: ProblemStatus;
  tracker_ref: string | null;
  reporter_reply: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}
