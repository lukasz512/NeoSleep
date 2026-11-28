/**
 * Data access + pure helpers for the platform work board (CORE-177,
 * docs/stories/platform-work-board.md). Every call reports a failure once and rethrows, so
 * the view only decides what to show. Platform admins only; the API answers 403 otherwise.
 */
import { isApiError, reportCaught, reportFailedResponse } from "@api";
import { apiFetch, backgroundApiFetch } from "./useApi";
import type {
  WorkAttachment,
  WorkGitState,
  WorkVerifyState,
  WorkItem,
  WorkItemDraft,
  WorkItemEvent,
  WorkItemPatch,
  WorkLabel,
  WorkLabelColor,
  WorkLink,
  WorkLinkKind,
  WorkPerson,
  WorkSessionToken,
  WorkStatus,
  WorkTeam,
} from "../types/workBoard";

/** Board columns, left to right. `canceled` is closed; its column shows only when asked for (CORE-221). */
export const WORK_BOARD_COLUMNS: readonly WorkStatus[] = [
  "triage",
  "backlog",
  "to_spec",
  "spec_ready",
  "approved",
  "building",
  "needs_review",
  "verifying",
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

/**
 * The board's own refresh while it stays open (CORE-219): no global loader and no report, so
 * nothing on screen reacts to it. null means this round failed and the board keeps what it shows.
 */
export async function refreshWorkItems(): Promise<WorkItem[] | null> {
  try {
    const res = await backgroundApiFetch(`${BASE}/items`, { handleErrors: false });
    return res.ok ? ((await res.json()) as { items: WorkItem[] }).items : null;
  } catch {
    return null;
  }
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

/** Queues a fresh test run for a ticket (CORE-277); the CI workflow picks it up. */
export async function rerunWorkVerify(key: string): Promise<WorkItem> {
  return (await request<{ item: WorkItem }>("useWorkBoard.verify", `${BASE}/items/${encodeURIComponent(key)}/verify`, jsonInit("POST", {}))).item;
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
/** The team filter's "every team" value. */
export const ALL_TEAMS = "all";

/** Label that keeps a ticket in Needs Review when its code reaches prod (CORE-221). */
export const HOLD_LABEL = "hold";

/**
 * Where the code is, for the card and the dialog (CORE-221): always for Building and Needs
 * Review once CI has reported, elsewhere only when something is merged. Never on a closed item.
 */
export function gitMarker(item: WorkItem): WorkGitState | null {
  if (!item.git_state || item.status === "done" || item.status === "canceled") return null;
  if (item.status === "building" || item.status === "needs_review") return item.git_state;
  return item.git_state === "none" ? null : item.git_state;
}

export const GIT_ICONS: Record<WorkGitState, string> = {
  none: "mdi-source-branch",
  dev: "mdi-source-merge",
  prod: "mdi-rocket-launch-outline",
};

/** The verify badge (CORE-277): null when the ticket was never verified. */
export function verifyMarker(item: WorkItem): WorkVerifyState | null {
  return item.verify_state ?? null;
}

export const VERIFY_ICONS: Record<WorkVerifyState, string> = {
  pending: "mdi-timer-sand",
  pass: "mdi-check-decagram-outline",
  fail: "mdi-alert-circle-outline",
};

/** A Needs Review ticket git disagrees with: nothing merged, or on prod and not held. */
export function outOfStep(item: WorkItem): boolean {
  if (item.status !== "needs_review") return false;
  return item.git_state === "none" || (item.git_state === "prod" && !item.labels.includes(HOLD_LABEL));
}

/** Merged and not on hold: the board closes it by itself once the code is on prod (CORE-221). */
export function closesByItself(item: WorkItem): boolean {
  return (item.git_state === "dev" || item.git_state === "prod") && !item.labels.includes(HOLD_LABEL);
}

/**
 * Needs Review in two groups (CORE-233): what waits for a person, the longest wait first, and
 * what is merged and closes by itself, in the order the column had.
 */
export function reviewGroups(items: readonly WorkItem[]): { waiting: WorkItem[]; merged: WorkItem[] } {
  const waiting = items.filter((item) => !closesByItself(item)).sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at));
  return { waiting, merged: items.filter(closesByItself) };
}

/** Label that sets a Backlog ticket aside; the tidy run adds it after 60 untouched days (CORE-234). */
export const LATER_LABEL = "later";

/** Backlog in two groups (CORE-234): what is still meant to be done, and what was set aside. */
export function backlogGroups(items: readonly WorkItem[]): { current: WorkItem[]; later: WorkItem[] } {
  const isLater = (item: WorkItem) => item.labels.some((label) => label.toLowerCase() === LATER_LABEL);
  return { current: items.filter((item) => !isLater(item)), later: items.filter(isLater) };
}

/**
 * What a ticket still lacks to enter Approved (CORE-234), the same rule the API enforces: a
 * priority and a Done when. A build given back from Building already passed it.
 */
export function approvedBlocker(
  item: Pick<WorkItem, "status" | "priority" | "done_when">,
  target: WorkStatus
): "priority" | "done_when" | null {
  if (target !== "approved" || item.status === "approved" || item.status === "building") return null;
  if (!item.priority) return "priority";
  return item.done_when?.trim() ? null : "done_when";
}

/** Handed over for review with no artifact to read (CORE-233). */
export function missingArtifact(item: WorkItem): boolean {
  return item.status === "needs_review" && !item.links.some((link) => link.kind === "artifact");
}

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

/** The links a card shows, one per kind, in CARD_LINK_KINDS order. */
export function cardLinks(item: WorkItem): WorkLink[] {
  return CARD_LINK_KINDS.flatMap((kind) => item.links.find((l) => l.kind === kind) ?? []);
}

/** Label colours, in the order the API hands them to new labels (CORE-219). */
export const WORK_LABEL_COLORS: readonly WorkLabelColor[] = ["blue", "teal", "green", "amber", "orange", "red", "pink", "purple"];

/** Most labels one item can carry; the API rejects more. */
export const MAX_ITEM_LABELS = 10;
export const MAX_LABEL_LENGTH = 40;

export async function fetchWorkLabels(): Promise<WorkLabel[]> {
  return (await request<{ items: WorkLabel[] }>("useWorkBoard.labels", `${BASE}/labels`)).items;
}

/** Renames or recolours a catalog label; a rename reaches every item that carries it. */
export async function patchWorkLabel(id: string, patch: { name?: string; color?: WorkLabelColor }): Promise<WorkLabel> {
  return (await request<{ item: WorkLabel }>("useWorkBoard.patchLabel", `${BASE}/labels/${encodeURIComponent(id)}`, jsonInit("PATCH", patch))).item;
}

const sameLabel = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** An item's labels as people see them: without the technical `session` one. */
export function shownLabels(item: WorkItem): string[] {
  return item.labels.filter((label) => !sameLabel(label, SESSION_LABEL));
}

/** True when the item carries every selected label; no selection matches everything. */
export function matchesLabels(item: WorkItem, selected: readonly string[]): boolean {
  return selected.every((wanted) => item.labels.some((label) => sameLabel(label, wanted)));
}

export interface WorkLabelLane {
  /** null is the "No label" lane. */
  label: string | null;
  items: WorkItem[];
}

/**
 * One lane per label, by name; an item with several labels sits in the lane of its first one
 * by name. Items without a label come last. A label nobody carries gets no lane.
 */
export function groupByLabel(items: readonly WorkItem[]): WorkLabelLane[] {
  const lanes = new Map<string, { label: string; items: WorkItem[] }>();
  const none: WorkItem[] = [];
  for (const item of items) {
    const first = shownLabels(item).sort(byName)[0];
    if (first === undefined) {
      none.push(item);
      continue;
    }
    const lane = lanes.get(first.toLowerCase()) ?? { label: first, items: [] };
    lane.items.push(item);
    lanes.set(first.toLowerCase(), lane);
  }
  const sorted: WorkLabelLane[] = [...lanes.values()].sort((a, b) => byName(a.label, b.label));
  return none.length ? [...sorted, { label: null, items: none }] : sorted;
}

const DAY_MS = 86_400_000;

/** Whole days since the item entered its column. */
export function daysInColumn(item: WorkItem, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(item.status_changed_at)) / DAY_MS));
}

/** Days after which a card waiting in a column is flagged; other columns never are. */
const STALE_AFTER_DAYS: Partial<Record<WorkStatus, number>> = { needs_review: 3, building: 7 };

export function isStale(item: WorkItem, now: number): boolean {
  const limit = STALE_AFTER_DAYS[item.status];
  return limit !== undefined && daysInColumn(item, now) > limit;
}

/** Past its due date and still open. `due_date` is a local calendar day. */
export function isOverdue(item: WorkItem, now: number): boolean {
  if (!item.due_date || item.status === "done" || item.status === "canceled") return false;
  const today = new Date(now);
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return item.due_date < ymd;
}

/** How long a session's last touch keeps the live dot on. */
export const LIVE_WINDOW_MS = 15 * 60_000;

export function isLive(at: string | null | undefined, now: number): boolean {
  return !!at && now - Date.parse(at) < LIVE_WINDOW_MS;
}

/** Two letters for an assignee: from the name's words, or from the email's local part. */
export function initialsOf(person: string): string {
  const words = (person.includes("@") ? person.split("@")[0]! : person).split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
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
