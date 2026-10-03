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
 * Only for the user's own "what have I seen" list (Łukasz, D5): nobody else
 * reads it, and nothing records how a status was set.
 */
export type ProgressStatus = "not_started" | "in_progress" | "completed";

export interface ProgressState {
  status: ProgressStatus;
  positionSec: number;
  maxPositionSec: number;
  durationSec: number | null;
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

  if (reachedEnd) return { status: "completed", positionSec, maxPositionSec, durationSec };
  if (prev.status === "completed") return { ...prev, positionSec, maxPositionSec, durationSec };
  return {
    status: maxPositionSec >= STARTED_SEC ? "in_progress" : "not_started",
    positionSec,
    maxPositionSec,
    durationSec,
  };
}

/** Whole-number percent of the furthest point reached; 100 once completed. */
export function progressPercent(state: Pick<ProgressState, "status" | "maxPositionSec" | "durationSec">): number {
  if (state.status === "completed") return 100;
  if (!state.durationSec) return 0;
  return Math.min(99, Math.round((state.maxPositionSec / state.durationSec) * 100));
}
