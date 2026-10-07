/**
 * Data access + pure helpers for the platform work board (CORE-177,
 * docs/stories/platform-work-board.md). Every call reports a failure once and rethrows, so
 * the view only decides what to show. Platform admins only; the API answers 403 otherwise.
 */
import { isApiError, reportCaught, reportFailedResponse } from "@api";
import { apiFetch } from "./useApi";
import type { WorkItem, WorkItemDraft, WorkItemEvent, WorkItemPatch, WorkLinkKind, WorkSessionToken, WorkStatus, WorkTeam } from "../types/workBoard";

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

export async function fetchWorkItem(key: string): Promise<{ item: WorkItem; events: WorkItemEvent[] }> {
  return request("useWorkBoard.item", `${BASE}/items/${encodeURIComponent(key)}`);
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

/** DELETE answers 204 with no body, so it skips request()'s JSON parse. */
export async function revokeSessionToken(id: string): Promise<void> {
  const where = "useWorkBoard.revokeToken";
  const path = `${BASE}/session-tokens/${encodeURIComponent(id)}`;
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
