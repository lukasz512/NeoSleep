/**
 * Case content that is data, not copy: client names (proper nouns, same in both locales),
 * which media each Privalia chapter uses, and Mendel's figures (client proposal, 2026-09-28).
 * Everything a visitor reads lives in locales/*.json.
 */

/** Section 06: only four names, in type (no logo files yet), in the proposal's order. */
export const CLIENT_NAMES = ["Universal Products & Experiences", "Grupo Planeta", "Privalia", "Mendel"] as const;

export interface PrivaliaChapter {
  id: "y2019" | "y2020" | "live";
  /** silent loop base under media/, or none when the chapter is type only */
  loop?: string;
  poster?: string;
  /** eFashion Day photos (encode-media.sh: 640 px always, 1280 px when the original allows) */
  photos?: { id: string; large: boolean }[];
}

export const PRIVALIA_CHAPTERS: PrivaliaChapter[] = [
  {
    id: "y2019",
    loop: "privalia/y2019",
    poster: "privalia/y2019-poster",
    // privalia06 (neon lounge) is left out: a different event, still to be named (P1, 2026-09-28)
    photos: [
      { id: "privalia04", large: true },
      { id: "privalia01", large: true },
      { id: "privalia02", large: true },
      { id: "privalia22", large: true },
      { id: "privalia05", large: true },
      { id: "privalia03", large: true },
    ],
  },
  { id: "y2020", loop: "privalia/y2020", poster: "privalia/y2020-poster" },
  { id: "live" },
];

/** Mendel figures from the proposal: "300 Invitados · Producción & Coordinación 360° · Equipo de Producción Dedicado". */
export const MENDEL_STATS = [
  { key: "guests", value: 300, suffix: "" },
  { key: "coordination", value: 360, suffix: "°" },
  { key: "team", value: null, suffix: "" },
] as const;
