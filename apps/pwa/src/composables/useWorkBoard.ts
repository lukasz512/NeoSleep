/**
 * Data access + pure helpers for the platform work board (CORE-177,
 * docs/stories/platform-work-board.md). Every call reports a failure once and rethrows, so
 * the view only decides what to show. Platform admins only; the API answers 403 otherwise.
 */
import { isApiError, reportCaught, reportFailedResponse } from "@api";
import { apiFetch } from "./useApi";
import type {
  WorkAttachment,
  WorkItem,
  WorkItemDraft,
  WorkItemEvent,
  WorkItemPatch,
  WorkLinkKind,
  WorkPerson,
  WorkSessionToken,
  WorkStatus,
  WorkTeam,
} from "../types/workBoard";

/** Board columns, left to right. `canceled` is closed and has no column. */
export const WORK_BOARD_COLUMNS: readonly WorkStatus[] = [
  "triage",
  "backlog",
  "to_spec",
  "spec_ready",
  "approved",
  "building",
  "needs_review",
  "done",
];

/** Every status a person may pick in the card detail, columns first. */
export const WORK_STATUS_OPTIONS: readonly WorkStatus[] = [...WORK_BOARD_COLUMNS, "canceled"];

/** Link kinds shown as icons on a card, in this order. */
export const CARD_LINK_KINDS: readonly WorkLinkKind[] = ["spec", "artifact", "pr", "ci"];

/** Linear's priority scale: 1 urgent … 4 low, 0 none. */
export const WORK_PRIORITIES = [1, 2, 3, 4, 0] as const;

const BASE = "/api/v1/platform/work";

async function request<T>(where: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, { ...init, handleErrors: false });
  } catch (err) {
    reportCaught(err, { where });
    throw err;
  }
  if (!res.ok) throw await reportFailedResponse(res, { where, path, method: init?.method ?? "GET" });
  return (await res.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Teams, or null when the signed-in user is not a platform admin (the board then stays hidden). */
export async function fetchWorkTeams(): Promise<WorkTeam[] | null> {
  try {
    return (await request<{ items: WorkTeam[] }>("useWorkBoard.teams", `${BASE}/teams`)).items;
  } catch (err) {
    if (isApiError(err) && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

export async function fetchWorkItems(): Promise<WorkItem[]> {
  return (await request<{ items: WorkItem[] }>("useWorkBoard.items", `${BASE}/items`)).items;
}

export interface WorkItemDetail {
  item: WorkItem;
  events: WorkItemEvent[];
  attachments: WorkAttachment[];
}

export async function fetchWorkItem(key: string): Promise<WorkItemDetail> {
  return request("useWorkBoard.item", `${BASE}/items/${encodeURIComponent(key)}`);
}

/** Platform admins, the only people an item can be assigned to. */
export async function fetchWorkPeople(): Promise<WorkPerson[]> {
  return (await request<{ items: WorkPerson[] }>("useWorkBoard.people", `${BASE}/people`)).items;
}

/** Uploads one image or PDF; with `commentId` it belongs to that comment. */
export async function uploadWorkAttachment(key: string, file: File, commentId: string | null = null): Promise<WorkAttachment> {
  const data = new FormData();
  if (commentId) data.append("comment", commentId);
  data.append("file", file);
  const path = `${BASE}/items/${encodeURIComponent(key)}/attachments`;
  return (await request<{ attachment: WorkAttachment }>("useWorkBoard.upload", path, { method: "POST", body: data })).attachment;
}

/** A signed URL valid for a few minutes; ask again rather than keeping it. */
export async function fetchAttachmentUrl(key: string, id: string): Promise<string> {
  const path = `${BASE}/items/${encodeURIComponent(key)}/attachments/${encodeURIComponent(id)}`;
  return (await request<{ url: string }>("useWorkBoard.attachmentUrl", path)).url;
}

export async function deleteWorkAttachment(key: string, id: string): Promise<void> {
  await requestNoContent("useWorkBoard.deleteAttachment", `${BASE}/items/${encodeURIComponent(key)}/attachments/${encodeURIComponent(id)}`);
}

export async function createWorkItem(draft: WorkItemDraft): Promise<WorkItem> {
  return (await request<{ item: WorkItem }>("useWorkBoard.create", `${BASE}/items`, jsonInit("POST", draft))).item;
}

export async function patchWorkItem(key: string, patch: WorkItemPatch): Promise<WorkItem> {
  return (await request<{ item: WorkItem }>("useWorkBoard.patch", `${BASE}/items/${encodeURIComponent(key)}`, jsonInit("PATCH", patch))).item;
}

export async function addWorkItemComment(key: string, body: string): Promise<WorkItemEvent> {
  return (
    await request<{ event: WorkItemEvent }>("useWorkBoard.comment", `${BASE}/items/${encodeURIComponent(key)}/comments`, jsonInit("POST", { body }))
  ).event;
}

/** Case-insensitive match on key and title; an empty query matches everything. */
export function matchesQuery(item: WorkItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || item.key.toLowerCase().includes(q) || item.title.toLowerCase().includes(q);
}

/** Items per status, each list sorted by priority (urgent first, none last), then the newest move. */
export function groupByStatus(items: readonly WorkItem[]): Record<WorkStatus, WorkItem[]> {
  const groups = Object.fromEntries(WORK_STATUS_OPTIONS.map((s) => [s, [] as WorkItem[]])) as Record<WorkStatus, WorkItem[]>;
  for (const item of items) groups[item.status].push(item);
  const rank = (p: number) => (p === 0 ? 5 : p);
  for (const list of Object.values(groups)) {
    list.sort((a, b) => rank(a.priority) - rank(b.priority) || b.status_changed_at.localeCompare(a.status_changed_at));
  }
  return groups;
}

/** The column left (-1) or right (+1) of `status`; null at the edges or for a closed item. */
export function neighbourStatus(status: WorkStatus, step: -1 | 1): WorkStatus | null {
  const index = WORK_BOARD_COLUMNS.indexOf(status);
  if (index < 0) return null;
  return WORK_BOARD_COLUMNS[index + step] ?? null;
}

/** Label a Claude Code session puts on the tickets it creates (CORE-187). */
export const SESSION_LABEL = "session";

export async function fetchSessionTokens(): Promise<WorkSessionToken[]> {
  return (await request<{ items: WorkSessionToken[] }>("useWorkBoard.tokens", `${BASE}/session-tokens`)).items;
}

/** The plaintext token is in this answer only; the board never shows it again. */
export async function issueSessionToken(name: string): Promise<{ item: WorkSessionToken; token: string }> {
  return request("useWorkBoard.issueToken", `${BASE}/session-tokens`, jsonInit("POST", { name }));
}

export async function revokeSessionToken(id: string): Promise<void> {
  await requestNoContent("useWorkBoard.revokeToken", `${BASE}/session-tokens/${encodeURIComponent(id)}`);
}

/** DELETE answers 204 with no body, so it skips request()'s JSON parse. */
async function requestNoContent(where: string, path: string): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "DELETE", handleErrors: false });
  } catch (err) {
    reportCaught(err, { where });
    throw err;
  }
  if (!res.ok) throw await reportFailedResponse(res, { where, path, method: "DELETE" });
}

/** The first link of a kind, for the card's icons. */
export function linkOf(item: WorkItem, kind: WorkLinkKind): string | null {
  return item.links.find((l) => l.kind === kind)?.url ?? null;
}

/** A markdown task line: `- [ ] text` / `- [x] text` (`*` bullets and `[X]` too). */
const TASK_LINE = /^(\s*[-*]\s+\[)([ xX])(\]\s?)(.*)$/;

export interface ChecklistLine {
  /** Line number in the text, for toggleChecklistLine. */
  line: number;
  text: string;
  done: boolean;
}

/** The task lines of "Done when" (CORE-195); other lines are left out. */
export function checklistLines(text: string | null): ChecklistLine[] {
  if (!text) return [];
  return text.split("\n").flatMap((raw, line) => {
    const match = TASK_LINE.exec(raw);
    return match ? [{ line, text: match[4]!, done: match[2] !== " " }] : [];
  });
}

/** Ticked of total task lines, for the card; null when the text has none. */
export function checklistProgress(text: string | null): { done: number; total: number } | null {
  const lines = checklistLines(text);
  return lines.length ? { done: lines.filter((l) => l.done).length, total: lines.length } : null;
}

/** Ticks or unticks the task on `line`; every other character stays as it was. */
export function toggleChecklistLine(text: string, line: number): string {
  const lines = text.split("\n");
  const match = TASK_LINE.exec(lines[line] ?? "");
  if (!match) return text;
  lines[line] = `${match[1]}${match[2] === " " ? "x" : " "}${match[3]}${match[4]}`;
  return lines.join("\n");
}

/** Every non-blank line as a task: plain lines and `-` bullets become open ones, task lines stay. */
export function asChecklist(text: string): string {
  return text
    .split("\n")
    .filter((raw) => raw.trim())
    .map((raw) => (TASK_LINE.test(raw) ? raw : `- [ ] ${raw.trim().replace(/^[-*]\s+/, "")}`))
    .join("\n");
}
