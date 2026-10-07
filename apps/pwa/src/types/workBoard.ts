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
  source: string;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
  completed_at: string | null;
}

export interface WorkItemEvent {
  id: string;
  kind: "created" | "status" | "comment" | "edit" | "link";
  from_status: WorkStatus | null;
  to_status: WorkStatus | null;
  body: string | null;
  actor: string | null;
  actor_kind: "human" | "agent" | "import";
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
}

export interface WorkItemPatch {
  title?: string;
  problem?: string | null;
  change?: string | null;
  done_when?: string | null;
  priority?: number;
  status?: WorkStatus;
}
