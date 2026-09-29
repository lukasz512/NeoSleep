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
  { name: "Universal Products & Experiences", logo: "logos/universal.svg", height: 1.9, anchor: "universal" },
  { name: "Grupo Planeta", logo: "logos/planeta.png", height: 1.1, anchor: "planeta" },
  { name: "Privalia", logo: "logos/privalia.png", height: 1.2, anchor: "privalia" },
  { name: "Mendel", logo: "logos/mendel.png", height: 1, anchor: "mendel" },
] as const;

export interface PrivaliaChapter {
  id: "y2019" | "y2020" | "beauty" | "live";
  /** vertical source (reels): the mosaic lays the photos out as portraits */
  portrait?: boolean;
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
    // Łukasz's "neon1–8" set (2026-09-28) groups the neon lounge (privalia06) with these, so it is
    // eFashion Day 2019 too; the other files in that set are copies of photos already here.
    photos: [
      { id: "privalia04", large: true },
      { id: "privalia06", large: true },
      { id: "privalia02", large: true },
      { id: "privalia22", large: true },
      { id: "privalia05", large: true },
      { id: "privalia03", large: true },
      { id: "privalia01", large: true },
    ],
  },
  {
    id: "y2020",
    loop: "privalia/y2020",
    poster: "privalia/y2020-poster",
    photos: [
      { id: "y2020a", large: true },
      { id: "y2020b", large: true },
    ],
  },
  // Privalia Beauty Week × Glamour at Brick Hotel CDMX: stills from the Glamour reels, cropped below
  // the magazine wordmark (encode-extra.sh). Vertical 1080 px sources, so 640 px only. Year from the
  // 2023 (Y1, Łukasz 2026-09-29).
  {
    id: "beauty",
    portrait: true,
    photos: [1, 2, 3, 4, 5, 6].map((n) => ({ id: `beauty${n}`, large: false })),
  },
  // Hugo Boss × Privalia live shopping: no photos yet.
  { id: "live" },
];

/**
 * Łukasz, 2026-09-28: "every event shows at least 2 photos". Anything with fewer stays in the
 * data (ready for when AJM sends more) but is not shown.
 */
export const MIN_PHOTOS = 2;
export const PRIVALIA_VISIBLE = PRIVALIA_CHAPTERS.filter((c) => (c.photos?.length ?? 0) >= MIN_PHOTOS);

/** Mendel figures from the proposal: "300 Invitados · Producción & Coordinación 360° · Equipo de Producción Dedicado". */
export const MENDEL_STATS = [
  { key: "guests", value: 300, suffix: "" },
  { key: "coordination", value: 360, suffix: "°" },
  { key: "team", value: null, suffix: "" },
] as const;
