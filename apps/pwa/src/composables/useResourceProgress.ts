import { reactive } from "vue";
import { reportCaught } from "@api";
import { apiFetch } from "./useApi";

/**
 * The signed-in user's watch progress for OrthoApnea webinars (NEO-209).
 * Module-level, like usePartnerResources: the tiles, the counts and the player
 * all read one map, so a report from the player updates the tile behind it.
 * Saved on the server (D2), so it follows the doctor across devices.
 */
export type ResourceProgressStatus = "not_started" | "in_progress" | "completed";
export type StatusFilter = "all" | ResourceProgressStatus;

export interface ResourceProgress {
  resourceId: string;
  status: ResourceProgressStatus;
  source: "watched" | "marked";
  positionSec: number;
  durationSec: number | null;
  percent: number;
  completedAt: string | null;
  updatedAt: string;
}

const BASE = "/api/v1/partners/orthoapnea/resources";
/** Below this there is nothing worth resuming (same threshold as "started" on the API). */
const RESUME_MIN_SEC = 10;
/** In the last 5 % a resume would land on the credits — start over instead. */
const RESUME_MAX_RATIO = 0.95;

const progress = reactive<Record<string, ResourceProgress>>({});

/** Second to offer "Continue from", or null to just start from 0 with no prompt. */
export function resumeAt(row: ResourceProgress | undefined, playerDurationSec: number | null): number | null {
  if (!row || row.positionSec < RESUME_MIN_SEC) return null;
  const duration = playerDurationSec || row.durationSec;
  if (!duration || row.positionSec >= duration * RESUME_MAX_RATIO) return null;
  return row.positionSec;
}

export function statusOf(progressMap: Record<string, ResourceProgress>, id: string): ResourceProgressStatus {
  return progressMap[id]?.status ?? "not_started";
}

export function countByStatus(videos: { id: string }[], progressMap: Record<string, ResourceProgress>): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: videos.length, not_started: 0, in_progress: 0, completed: 0 };
  for (const v of videos) counts[statusOf(progressMap, v.id)] += 1;
  return counts;
}

export function filterByStatus<T extends { id: string }>(videos: T[], progressMap: Record<string, ResourceProgress>, filter: StatusFilter): T[] {
  return filter === "all" ? videos : videos.filter((v) => statusOf(progressMap, v.id) === filter);
}

async function write(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    const res = await apiFetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      handleErrors: false, // a missed save is retried by the next report; never a toast mid-video
    });
    if (!res.ok) return;
    const row = (await res.json()) as ResourceProgress;
    progress[row.resourceId] = row;
  } catch (err) {
    reportCaught(err, { where: "useResourceProgress.write" });
  }
}

async function load(): Promise<void> {
  try {
    const res = await apiFetch(`${BASE}/progress`, { handleErrors: false });
    if (!res.ok) return;
    const data = (await res.json()) as { progress: ResourceProgress[] };
    for (const key of Object.keys(progress)) delete progress[key];
    for (const row of data.progress) progress[row.resourceId] = row;
  } catch (err) {
    reportCaught(err, { where: "useResourceProgress.load" });
  }
}

function reportPosition(id: string, positionSec: number, durationSec: number, ended: boolean): Promise<void> {
  return write(`${BASE}/${encodeURIComponent(id)}/progress`, { positionSec, durationSec, ended });
}

/** Tile menu (D4): mark watched by hand, or reset to not watched. */
function markStatus(id: string, status: "completed" | "not_started"): Promise<void> {
  return write(`${BASE}/${encodeURIComponent(id)}/status`, { status });
}

export function useResourceProgress() {
  return { progress, load, reportPosition, markStatus };
}
