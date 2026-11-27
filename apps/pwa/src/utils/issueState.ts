import type { DiagnosticGroup, ProblemReport } from "../types/issues";

/**
 * One state per issue, the same set for errors and user reports (CORE-227):
 * New → Ticket → Being fixed → Artifact ready → Done, plus "Needs you" for a blocked
 * fix and Dismissed. It is derived from the row and its board ticket, never typed in.
 */
export const ISSUE_STATES = ["new", "ticket", "being_fixed", "needs_you", "artifact_ready", "done", "dismissed"] as const;
export type IssueState = (typeof ISSUE_STATES)[number];

/** The four header counters; each one is also a filter. */
export const ISSUE_BUCKETS = ["new", "fixing", "ready", "done"] as const;
export type IssueBucket = (typeof ISSUE_BUCKETS)[number];

/** "active" is everything still open (the default view); "all" also shows old and dismissed rows. */
export type IssueFilter = IssueBucket | "active" | "all";

export interface StatedIssue {
  state: IssueState;
  /** When it reached Done, for "Done this week". */
  doneAt: string | null;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** null when the ticket says nothing about the fix (no ticket, or a canceled one). */
function ticketState(status: string | null | undefined, blocked: boolean): IssueState | null {
  if (!status || status === "canceled") return null;
  if (status === "building") return blocked ? "needs_you" : "being_fixed";
  if (status === "needs_review" || status === "verifying") return "artifact_ready";
  if (status === "done") return "done";
  return "ticket";
}

export function errorState(group: Pick<DiagnosticGroup, "status" | "ticket">): IssueState {
  if (group.status === "dismissed") return "dismissed";
  if (group.status === "resolved") return "done";
  return ticketState(group.ticket?.status, Boolean(group.ticket?.blocked_reason)) ?? "new";
}

/** A report follows the error it is linked to while both are open; otherwise its own status. */
export function reportState(report: Pick<ProblemReport, "status" | "linked_error">): IssueState {
  if (report.status === "dismissed") return "dismissed";
  if (report.status === "resolved") return "done";
  const linked = report.linked_error;
  const fromError = linked?.status === "open" ? ticketState(linked.ticket_status, linked.blocked) : null;
  if (fromError && fromError !== "done") return fromError;
  return report.status === "in_progress" ? "being_fixed" : "new";
}

export function statedError(group: DiagnosticGroup): StatedIssue {
  const state = errorState(group);
  const ticketDone = group.ticket?.status === "done" ? group.ticket.status_changed_at : null;
  return { state, doneAt: state === "done" ? (ticketDone ?? group.last_seen) : null };
}

export function statedReport(report: ProblemReport): StatedIssue {
  const state = reportState(report);
  return { state, doneAt: state === "done" ? (report.resolved_at ?? report.updated_at) : null };
}

export function issueBucket(issue: StatedIssue, now: number = Date.now()): IssueBucket | null {
  switch (issue.state) {
    case "new":
    case "ticket":
      return "new";
    case "being_fixed":
    case "needs_you":
      return "fixing";
    case "artifact_ready":
      return "ready";
    case "done":
      return issue.doneAt && now - new Date(issue.doneAt).getTime() <= WEEK_MS ? "done" : null;
    default:
      return null;
  }
}

export function countIssues(issues: StatedIssue[], now: number = Date.now()): Record<IssueBucket, number> {
  const counts: Record<IssueBucket, number> = { new: 0, fixing: 0, ready: 0, done: 0 };
  for (const issue of issues) {
    const bucket = issueBucket(issue, now);
    if (bucket) counts[bucket] += 1;
  }
  return counts;
}

export function matchesIssueFilter(issue: StatedIssue, filter: IssueFilter, now: number = Date.now()): boolean {
  if (filter === "all") return true;
  const bucket = issueBucket(issue, now);
  return filter === "active" ? bucket !== null && bucket !== "done" : bucket === filter;
}
