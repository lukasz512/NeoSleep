import type { WorkStatus } from "../../types/workBoard";

/**
 * How each status and priority is drawn on the work board (CORE-225). A status has its own
 * shape as well as a colour, so colour is never the only signal: a dashed ring before work is
 * shaped, a pie that fills along the workflow, a check or a cross once it is closed.
 */
export type WorkGlyphShape = "dashed" | "pie" | "check" | "cross";
export type WorkGlyphTone = "intake" | "neutral" | "spec" | "approved" | "building" | "review" | "done";

export interface WorkStatusGlyphSpec {
  shape: WorkGlyphShape;
  tone: WorkGlyphTone;
  /** Share of the pie that is filled, 0–1 (pies only). */
  fill?: number;
}

export const WORK_STATUS_GLYPHS: Readonly<Record<WorkStatus, WorkStatusGlyphSpec>> = {
  triage: { shape: "dashed", tone: "intake" },
  backlog: { shape: "dashed", tone: "neutral" },
  to_spec: { shape: "pie", tone: "spec", fill: 1 / 6 },
  spec_ready: { shape: "pie", tone: "spec", fill: 2 / 6 },
  approved: { shape: "pie", tone: "approved", fill: 3 / 6 },
  building: { shape: "pie", tone: "building", fill: 4 / 6 },
  needs_review: { shape: "pie", tone: "review", fill: 5 / 6 },
  verifying: { shape: "pie", tone: "review", fill: 5.5 / 6 },
  done: { shape: "check", tone: "done" },
  canceled: { shape: "cross", tone: "neutral" },
};

/** Mid-tones that hold 3:1 against both the light and the dark surface. */
export const WORK_GLYPH_COLORS: Readonly<Record<WorkGlyphTone, string>> = {
  intake: "#e08a1e",
  neutral: "#8a9699",
  spec: "#3b82c4",
  approved: "#8466d9",
  building: "#d1a011",
  review: "#2f9e5b",
  done: "#128f83",
};

export const WORK_URGENT_COLOR = WORK_GLYPH_COLORS.intake;

function isKnownStatus(status: string): status is WorkStatus {
  return Object.prototype.hasOwnProperty.call(WORK_STATUS_GLYPHS, status);
}

/**
 * The glyph for a status, falling back to the backlog ring for a value the board does not know
 * (CORE-287): history events keep from/to status as free text, so a legacy value can arrive at
 * runtime and must not take the whole board down.
 */
export function workStatusGlyph(status: string): WorkStatusGlyphSpec {
  return isKnownStatus(status) ? WORK_STATUS_GLYPHS[status] : WORK_STATUS_GLYPHS.backlog;
}

export function workStatusColor(status: string): string {
  return WORK_GLYPH_COLORS[workStatusGlyph(status).tone];
}

export type WorkStatusGroup = "intake" | "spec" | "delivery" | "closed";

/** The status menu's sections, in board order. */
export const WORK_STATUS_GROUPS: readonly { id: WorkStatusGroup; statuses: readonly WorkStatus[] }[] = [
  { id: "intake", statuses: ["triage", "backlog"] },
  { id: "spec", statuses: ["to_spec", "spec_ready"] },
  { id: "delivery", statuses: ["approved", "building", "needs_review", "verifying"] },
  { id: "closed", statuses: ["done", "canceled"] },
];

/** Lit bars per priority on Linear's scale: 2 high → 3 bars, 3 medium → 2, 4 low → 1. */
export function litBars(priority: number): number {
  return priority >= 2 && priority <= 4 ? 5 - priority : 0;
}
