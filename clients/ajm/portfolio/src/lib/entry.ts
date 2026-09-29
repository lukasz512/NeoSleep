/**
 * Which entry animation to play (D3 note + R3). It plays on every load, reloads included:
 * Łukasz, 2026-09-28, "a refresh shows a still: the entry must be spectacular and minimal".
 *  - arrived by QR (?src=qr)  → "qr": a black QR assembles, holds and dissolves (QR_PRELUDE_MS), then
 *                               the regular "link" entry plays in full (round 8, Łukasz 2026-09-29)
 *  - any other link           → "link": line → AJ mark → the line opens like a shutter (~2.4 s)
 *  - weak device / connection → "fade": a plain crossfade, whatever the source
 */
export type EntryKind = "qr" | "link" | "fade";

export interface EntryInput {
  search: string;
  lite: boolean;
}

export function pickEntry({ search, lite }: EntryInput): EntryKind {
  if (lite) return "fade";
  return new URLSearchParams(search).get("src") === "qr" ? "qr" : "link";
}

/** The QR prelude: modules fly in (~1.7 s), the code holds, then it dissolves (ends at 2.8 s). */
export const QR_PRELUDE_MS = 2800;

const LINK = { open: 1500, done: 2500 };

/** When the page behind starts revealing (the hero reacts at this moment), and when the overlay is gone. */
export const ENTRY_TIMING_MS: Record<EntryKind, { open: number; done: number }> = {
  qr: { open: QR_PRELUDE_MS + LINK.open, done: QR_PRELUDE_MS + LINK.done },
  link: LINK,
  fade: { open: 0, done: 450 },
};
