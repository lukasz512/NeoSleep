/**
 * Grupo Planeta events and their photos, as listed by Łukasz on 2026-09-28.
 * Event names are proper nouns (book titles) and stay in Spanish in both locales;
 * the descriptive copy lives in locales/*.json under planeta.events.<id>.
 *
 * `large` marks photos whose original is ≥1600 px (encode-media.sh made a 1280 px variant);
 * only those may be shown full-bleed. The rest are WhatsApp-sized and shown small.
 */
export interface PlanetaEvent {
  id: string;
  title: string;
  year?: number;
  photos: string[];
}

export const PLANETA_EVENTS: PlanetaEvent[] = [
  { id: "bordes", title: "Colección Bordes", year: 2024, photos: ["planeta11", "planeta4", "planeta2", "planeta12"] },
  { id: "novedades2025", title: "Novedades Grupo Planeta", year: 2025, photos: ["planeta5", "planeta10", "planeta23"] },
  {
    id: "novedades2024",
    title: "Novedades Grupo Planeta",
    year: 2024,
    photos: ["planeta15", "planeta13", "planeta14", "planeta1", "planeta3", "planeta8", "planeta9"],
  },
  { id: "cronicas", title: "Crónicas de la capital", photos: ["planeta00", "planeta7"] },
  { id: "algundia", title: "Algún día, hoy", year: 2019, photos: ["planeta22"] },
  { id: "duelo", title: "Duelo de historias", photos: ["planeta20", "planeta21", "planeta18", "planeta17"] },
  // E2 (2026-09-28): a Grupo Planeta book launch held at Pizzería Vesubio; title and year to come.
  { id: "vesubio", title: "Pizzería Vesubio", photos: ["planeta24", "planeta25"] },
];

export const LARGE_PHOTOS = new Set([
  "planeta13",
  "planeta14",
  "planeta15",
  "planeta17",
  "planeta18",
  "planeta20",
  "planeta21",
  "planeta22",
]);

/** Best source width for a photo: 1280 only when the original can carry it. */
export function photoBase(id: string, wantLarge: boolean): string {
  return `planeta/${id}-${wantLarge && LARGE_PHOTOS.has(id) ? 1280 : 640}`;
}
