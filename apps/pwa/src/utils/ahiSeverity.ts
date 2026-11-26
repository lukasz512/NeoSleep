/** AASM adult OSA severity by AHI (events/h): <5 none, 5–15 mild, 15–30 moderate, ≥30 severe. */
export type AhiSeverity = "normal" | "mild" | "moderate" | "severe";

/** Where the severity scale ends — an AHI above it sits at the right edge. */
export const AHI_SCALE_MAX = 45;

export function ahiSeverity(ahi: number): AhiSeverity {
  if (ahi >= 30) return "severe";
  if (ahi >= 15) return "moderate";
  if (ahi >= 5) return "mild";
  return "normal";
}

/** The AHI's position on the 0–AHI_SCALE_MAX scale, in percent (0–100). */
export function ahiScalePercent(ahi: number): number {
  return (Math.min(Math.max(ahi, 0), AHI_SCALE_MAX) / AHI_SCALE_MAX) * 100;
}
