/**
 * Own documents shown as the first group on Resources, as cards like the
 * webinar cards (NEO-242). Files live in apps/pwa/public/files/ and open in the
 * browser's PDF viewer, in this order. Never put them in a folder named like
 * an app route: the server would answer that route with a 403 on reload.
 * Opened state per user: API /resources/documents (ids must match the
 * allowlist in apps/api/src/routes/resourceDocuments.ts).
 */
export interface FeaturedResource {
  id: string;
  titleKey: string;
  /** Meta line under the title when there is no edition date and the file is not opened yet. */
  subtitleKey?: string;
  /** Path under the app's public folder, without the base URL. */
  file: string;
  /** Cover image (first slide), same folder rules as `file`. */
  cover: string;
  /** Slide count shown on the cover. */
  slides: number;
  /** Language code of the content, shown like a webinar's language. */
  language: string;
  /** ISO date (YYYY-MM-DD) of the current edition; the card says "New" for 30 days after it. */
  editionDate?: string;
}

export const FEATURED_RESOURCES: readonly FeaturedResource[] = [
  {
    id: "protocolo-atencion",
    titleKey: "user.resources.featured.protocol.title",
    subtitleKey: "user.resources.featured.protocol.subtitle",
    file: "files/protocolo-atencion-neosleep.pdf",
    cover: "files/protocolo-atencion-neosleep.cover.jpg",
    slides: 24,
    language: "es",
  },
  {
    // Built from docs/user-guide/ (pnpm guide:build); Spanish (MX) only for now.
    id: "guia-uso",
    titleKey: "user.resources.featured.guide.title",
    file: "files/guia-uso-neosleep.pdf",
    cover: "files/guia-uso-neosleep.cover.jpg",
    slides: 25,
    language: "es",
    editionDate: "2026-10-07",
  },
];

function withBase(path: string, base: string): string {
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}

export function featuredResourceHref(resource: FeaturedResource, base: string = import.meta.env.BASE_URL): string {
  return withBase(resource.file, base);
}

export function featuredCoverHref(resource: FeaturedResource, base: string = import.meta.env.BASE_URL): string {
  return withBase(resource.cover, base);
}

const NEW_EDITION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True from the edition date (UTC midnight) until 30 days after it. */
export function isNewEdition(editionDate: string | undefined, now: Date): boolean {
  if (!editionDate) return false;
  const age = now.getTime() - new Date(editionDate).getTime();
  return age >= 0 && age <= NEW_EDITION_DAYS * DAY_MS;
}
