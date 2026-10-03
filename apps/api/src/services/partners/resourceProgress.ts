/**
 * Watch status of one partner video for one user (NEO-209). Pure: the route
 * loads the stored row, calls nextProgress() with what the player reported,
 * and saves the result.
 *
 *   not_started — never opened, or under STARTED_SEC watched
 *   in_progress — started, under COMPLETED_RATIO of the furthest point reached
 *   completed   — COMPLETED_RATIO reached or the video ended; sticky, a rewatch
 *                 only moves the resume position
 *
 * `source` says how the status was set: "watched" by playback, "marked" by
 * hand from the tile menu (D4). A manager report (follow-up) needs to tell
 * the two apart, so it is stored from the start.
 */
export type ProgressStatus = "not_started" | "in_progress" | "completed";
export type ProgressSource = "watched" | "marked";

export interface ProgressState {
  status: ProgressStatus;
  positionSec: number;
  maxPositionSec: number;
  durationSec: number | null;
  source: ProgressSource;
}

export interface PlaybackReport {
  positionSec: number;
  durationSec: number;
  ended?: boolean;
}

export const STARTED_SEC = 10;
export const COMPLETED_RATIO = 0.9;

export function nextProgress(prev: ProgressState, report: PlaybackReport): ProgressState {
  const durationSec = Math.max(0, Math.round(report.durationSec));
  const positionSec = Math.min(Math.max(0, Math.round(report.positionSec)), durationSec);
  const maxPositionSec = Math.max(prev.maxPositionSec, positionSec);
  const reachedEnd = report.ended === true || (durationSec > 0 && maxPositionSec / durationSec >= COMPLETED_RATIO);

  if (reachedEnd) return { status: "completed", positionSec, maxPositionSec, durationSec, source: "watched" };
  if (prev.status === "completed") return { ...prev, positionSec, maxPositionSec, durationSec };
  return {
    status: maxPositionSec >= STARTED_SEC ? "in_progress" : "not_started",
    positionSec,
    maxPositionSec,
    durationSec,
    source: prev.source,
  };
}

/** Whole-number percent of the furthest point reached; 100 once completed. */
export function progressPercent(state: Pick<ProgressState, "status" | "maxPositionSec" | "durationSec">): number {
  if (state.status === "completed") return 100;
  if (!state.durationSec) return 0;
  return Math.min(99, Math.round((state.maxPositionSec / state.durationSec) * 100));
}
