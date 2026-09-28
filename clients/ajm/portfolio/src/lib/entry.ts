/**
 * Which entry animation to play (D3 note + R3). It plays on every load, reloads included:
 * Łukasz, 2026-09-28, "a refresh shows a still: the entry must be spectacular and minimal".
 *  - arrived by QR (?src=qr)  → "qr": the QR, cut from one photo, bursts into the page (~2.1 s)
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

/** When the page behind starts revealing (the hero reacts at this moment), and when the overlay is gone. */
export const ENTRY_TIMING_MS: Record<EntryKind, { open: number; done: number }> = {
  qr: { open: 1450, done: 2100 },
  link: { open: 1500, done: 2500 },
  fade: { open: 0, done: 450 },
};
