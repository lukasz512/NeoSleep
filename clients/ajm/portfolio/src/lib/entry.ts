/**
 * Which entry animation to play (D3 note + R3):
 *  - arrived by QR (?src=qr)  → "qr": the QR, cut from one hero photo, bursts into it (~2 s)
 *  - any other link           → "link": line → AJ monogram → image (~1.5 s)
 *  - weak device / connection → "fade": a plain crossfade, whatever the source
 *  - already played this session (reload) → "none": straight back to the section
 */
export type EntryKind = "qr" | "link" | "fade" | "none";

export interface EntryInput {
  search: string;
  lite: boolean;
  playedThisSession: boolean;
}

export function pickEntry({ search, lite, playedThisSession }: EntryInput): EntryKind {
  if (playedThisSession) return "none";
  if (lite) return "fade";
  return new URLSearchParams(search).get("src") === "qr" ? "qr" : "link";
}

export const ENTRY_DURATION_MS: Record<EntryKind, number> = { qr: 2100, link: 1500, fade: 400, none: 0 };
