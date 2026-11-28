import { describe, it, expect } from "vitest";
import { countIssues, errorState, issueBucket, matchesIssueFilter, reportState, type StatedIssue } from "./issueState";
import type { DiagnosticTicket } from "../types/issues";

const NOW = new Date("2026-11-17T12:00:00Z").getTime();

function ticket(status: string, blocked_reason: string | null = null): DiagnosticTicket {
  return { key: "CORE-1", status, branch: null, status_changed_at: "2026-11-16T12:00:00Z", artifact_url: null, pr_url: null, blocked_reason };
}

describe("issueState", () => {
  it("maps an error and its ticket status to one chip", () => {
    expect(errorState({ status: "open", ticket: null })).toBe("new");
    for (const status of ["triage", "backlog", "to_spec", "spec_ready", "approved"]) {
      expect(errorState({ status: "open", ticket: ticket(status) })).toBe("ticket");
    }
    expect(errorState({ status: "open", ticket: ticket("building") })).toBe("being_fixed");
    expect(errorState({ status: "open", ticket: ticket("needs_review") })).toBe("artifact_ready");
    expect(errorState({ status: "open", ticket: ticket("done") })).toBe("done");
    expect(errorState({ status: "open", ticket: ticket("canceled") })).toBe("new");
  });

  it("shows a blocked fix as needs-you", () => {
    expect(errorState({ status: "open", ticket: ticket("building", "cannot reproduce") })).toBe("needs_you");
  });

  it("lets the admin's own verdict win over the ticket", () => {
    expect(errorState({ status: "resolved", ticket: ticket("building") })).toBe("done");
    expect(errorState({ status: "dismissed", ticket: ticket("needs_review") })).toBe("dismissed");
  });

  it("gives a report the state of its open linked error, else its own status", () => {
    expect(reportState({ status: "new", linked_error: null })).toBe("new");
    expect(reportState({ status: "in_progress" })).toBe("being_fixed");
    expect(reportState({ status: "new", linked_error: { status: "open", ticket_status: "needs_review", blocked: false } })).toBe("artifact_ready");
    expect(reportState({ status: "new", linked_error: { status: "open", ticket_status: "building", blocked: true } })).toBe("needs_you");
    // The error is closed but the reporter has no answer yet: the report stays open.
    expect(reportState({ status: "in_progress", linked_error: { status: "resolved", ticket_status: "done", blocked: false } })).toBe("being_fixed");
    expect(reportState({ status: "new", linked_error: { status: "open", ticket_status: "done", blocked: false } })).toBe("new");
    expect(reportState({ status: "resolved", linked_error: { status: "open", ticket_status: "building", blocked: false } })).toBe("done");
    expect(reportState({ status: "dismissed", linked_error: null })).toBe("dismissed");
  });

  it("counts four buckets and keeps Done to the last seven days", () => {
    const issues: StatedIssue[] = [
      { state: "new", doneAt: null },
      { state: "ticket", doneAt: null },
      { state: "being_fixed", doneAt: null },
      { state: "needs_you", doneAt: null },
      { state: "artifact_ready", doneAt: null },
      { state: "done", doneAt: "2026-11-15T12:00:00Z" },
      { state: "done", doneAt: "2026-11-01T12:00:00Z" },
      { state: "dismissed", doneAt: null },
    ];
    expect(countIssues(issues, NOW)).toEqual({ new: 2, fixing: 2, ready: 1, done: 1 });
    expect(issueBucket({ state: "done", doneAt: "2026-11-01T12:00:00Z" }, NOW)).toBeNull();
  });

  it("filters: active hides done and dismissed, all hides nothing", () => {
    const done: StatedIssue = { state: "done", doneAt: "2026-11-15T12:00:00Z" };
    const dismissed: StatedIssue = { state: "dismissed", doneAt: null };
    const ready: StatedIssue = { state: "artifact_ready", doneAt: null };
    expect([done, dismissed, ready].map((i) => matchesIssueFilter(i, "active", NOW))).toEqual([false, false, true]);
    expect([done, dismissed, ready].map((i) => matchesIssueFilter(i, "all", NOW))).toEqual([true, true, true]);
    expect([done, dismissed, ready].map((i) => matchesIssueFilter(i, "done", NOW))).toEqual([true, false, false]);
    expect([done, dismissed, ready].map((i) => matchesIssueFilter(i, "ready", NOW))).toEqual([false, false, true]);
  });
});
