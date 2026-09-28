/**
 * Case content that is data, not copy: client names (proper nouns, same in both locales),
 * which media each Privalia chapter uses, and Mendel's figures (client proposal, 2026-09-28).
 * Everything a visitor reads lives in locales/*.json.
 */

/**
 * Section 06: four logos only, in the proposal's order. Files come from AJM (2026-09-28) and are
 * turned into one-colour masks by scripts/encode-logos.sh. `height` evens out the optical size
 * (a wide wordmark needs less height than one with a symbol). The name is the accessible label.
 * Universal: the file AJM sent is the Universal Pictures mark (case: Universal Products & Experiences).
 */
export const CLIENTS = [
  { name: "Universal Products & Experiences", logo: "logos/universal.svg", height: 1.9 },
  { name: "Grupo Planeta", logo: "logos/planeta.png", height: 1.1 },
  { name: "Privalia", logo: "logos/privalia.png", height: 1.2 },
  { name: "Mendel", logo: "logos/mendel.png", height: 1 },
] as const;

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
