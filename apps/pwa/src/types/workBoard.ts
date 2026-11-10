/** Platform work board (CORE-177) — mirrors apps/api/src/db/workBoard.ts. */

export type WorkStatus =
  | "triage"
  | "backlog"
  | "to_spec"
  | "spec_ready"
  | "approved"
  | "building"
  | "needs_review"
  | "done"
  | "canceled";

export type WorkLinkKind = "artifact" | "spec" | "pr" | "ci" | "other";

export interface WorkLink {
  kind: WorkLinkKind;
  url: string;
  title?: string;
}

export interface WorkTeam {
  key: string;
  name: string;
  kind: "platform" | "client";
}

export interface WorkItem {
  id: string;
  key: string;
  team_key: string;
  number: number;
  title: string;
  problem: string | null;
  change: string | null;
  done_when: string | null;
  status: WorkStatus;
  priority: number;
  labels: string[];
  links: WorkLink[];
  branch: string | null;
  /** A platform admin's email (CORE-192). */
  assignee: string | null;
  /** YYYY-MM-DD */
  due_date: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
  completed_at: string | null;
}

export interface WorkItemEvent {
  id: string;
  kind: "created" | "status" | "comment" | "edit" | "link" | "attachment";
  from_status: WorkStatus | null;
  to_status: WorkStatus | null;
  body: string | null;
  actor: string | null;
  actor_kind: "human" | "agent" | "session" | "import";
  created_at: string;
}

export interface WorkItemDraft {
  team: string;
  title: string;
  problem?: string | null;
  change?: string | null;
  done_when?: string | null;
  priority?: number;
  status?: WorkStatus;
  assignee?: string | null;
  due_date?: string | null;
}

export interface WorkItemPatch {
  title?: string;
  problem?: string | null;
  change?: string | null;
  done_when?: string | null;
  priority?: number;
  status?: WorkStatus;
  assignee?: string | null;
  due_date?: string | null;
}

/** An image or PDF on an item, or on one of its comments (`event_id`). The bytes stay private; ask for a signed URL. */
export interface WorkAttachment {
  id: string;
  item_id: string;
  event_id: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

/** Someone an item can be assigned to. */
export interface WorkPerson {
  email: string;
  name: string | null;
}

/** A device's token for Claude Code sessions (CORE-187); the plaintext only comes back once, on issue. */
export interface WorkSessionToken {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
