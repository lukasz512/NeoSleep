import { ORTHOAPNEA_BASE_URL, ORTHOAPNEA_EMAIL, ORTHOAPNEA_PASSWORD } from "../../env.js";
import { PartnerServiceError } from "../../errors.js";
import type { PartnerResourceItem } from "./types.js";

/**
 * OrthoApnea (apneadock.es) partner integration. One shared NeoSleep account,
 * used server-side only — the frontend never sees ORTHOAPNEA_EMAIL/PASSWORD
 * or the session token (CLAUDE.md Architecture Rule #1).
 *
 * Session is a module-level singleton: every NeoSleep rep/doctor using this
 * feature shares the one OrthoApnea login, so there is exactly one token to
 * manage per apps/api process, not one per NeoSleep user.
 *
 * Scope of this file: resources (documents/videos) only. Order submission
 * against the shared account is intentionally NOT implemented yet — it needs
 * its own request-queue (concurrent orders on one shared account risk a race
 * on OrthoApnea's cart-like session state) and we haven't captured their
 * order endpoint yet. See docs/ADR-015 discussion / project memory.
 *
 * ⚠️ UNVERIFIED: the login endpoint/payload below (LOGIN_PATH, body and
 * response field names) is a best-effort guess, not a captured request. Open
 * apneadock.es, log in with the browser devtools Network tab open, find the
 * actual login call, and correct LOGIN_PATH / the body / the token field
 * name below to match before relying on this in anything but local testing.
 * Every login attempt (success/failure) is logged via console — check those
 * logs first when testing the real endpoint.
 *
 * Resource + media paths (RESOURCES_PATH, DOCUMENT_MEDIA_PATH,
 * TUTORIAL_VIDEO_MEDIA_PATH, DOC_VIDEO_MEDIA_PATH) ARE confirmed, from
 * captured page renders.
 */

const LOGIN_PATH = "/api/auth/login";
const RESOURCES_PATH = "/api/resources";
/** Confirmed from captured page renders — apneadock.es serves documents from exactly this path (e.g. /media/doc/OA010.pdf). */
const DOCUMENT_MEDIA_PATH = "/media/doc";
/**
 * Videos are split across (at least) two folders and the JSON alone doesn't
 * reliably say which one a given row uses — ids 56–58 ("Recursos gráficos"
 * category) are confirmed under DOC_VIDEO_MEDIA_PATH, while the "Tutoriales"
 * webinar-style videos are confirmed under TUTORIAL_VIDEO_MEDIA_PATH. Rather
 * than hardcode a row → folder rule we don't actually have, tryVideoPaths()
 * below attempts both and caches whichever one 200s per resource id.
 */
const TUTORIAL_VIDEO_MEDIA_PATH = "/media/video/tutorials";
const DOC_VIDEO_MEDIA_PATH = "/media/doc/videos";
const VIDEO_TYPE = 2;

interface OrthoApneaSession {
  token: string;
  obtainedAt: number;
}

let session: OrthoApneaSession | null = null;
let loginInFlight: Promise<OrthoApneaSession> | null = null;

async function login(): Promise<OrthoApneaSession> {
  if (!ORTHOAPNEA_EMAIL || !ORTHOAPNEA_PASSWORD) {
    throw new PartnerServiceError("orthoapnea", "ORTHOAPNEA_EMAIL / ORTHOAPNEA_PASSWORD not configured");
  }

  let res: Response;
  try {
    res = await fetch(`${ORTHOAPNEA_BASE_URL}${LOGIN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ORTHOAPNEA_EMAIL, password: ORTHOAPNEA_PASSWORD }),
    });
  } catch (cause) {
    console.error("[orthoapnea] login request failed (network error):", cause);
    throw new PartnerServiceError("orthoapnea", "login request failed (network error)", cause);
  }
  if (!res.ok) {
    console.error(`[orthoapnea] login failed with status ${res.status}`);
    throw new PartnerServiceError("orthoapnea", `login failed with status ${res.status}`);
  }

  const data = (await res.json()) as { token?: string; accessToken?: string };
  const token = data.token ?? data.accessToken;
  if (!token) {
    console.error("[orthoapnea] login response did not contain a recognizable token field:", data);
    throw new PartnerServiceError("orthoapnea", "login response did not contain a recognizable token field");
  }
  console.log("[orthoapnea] login succeeded, session established");
  return { token, obtainedAt: Date.now() };
}

/** De-duped: concurrent callers during a cold start all await the same in-flight login instead of triggering N logins. */
async function ensureSession(): Promise<OrthoApneaSession> {
  if (session) return session;
  if (!loginInFlight) {
    loginInFlight = login()
      .then((s) => {
        session = s;
        return s;
      })
      .finally(() => {
        loginInFlight = null;
      });
  }
  return loginInFlight;
}

async function authedFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const { token } = await ensureSession();
  const res = await fetch(`${ORTHOAPNEA_BASE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !isRetry) {
    console.warn(`[orthoapnea] 401 on ${path} — session likely expired, re-logging in and retrying once`);
    session = null; // force a fresh login and retry exactly once
    return authedFetch(path, init, true);
  }
  return res;
}

interface RawOrthoApneaResource {
  id: number;
  type: number;
  category: number;
  weight: number;
  deleted: boolean;
  titleEs?: string;
  titleEn?: string;
  titleDe?: string;
  titleFr?: string;
  titlePt?: string;
  titleNl?: string;
  descriptionEs?: string;
  descriptionEn?: string;
  descriptionDe?: string;
  descriptionFr?: string;
  descriptionPt?: string;
  descriptionNl?: string;
  url?: string;
  urlEs?: string;
  urlEn?: string;
  urlDe?: string;
  urlFr?: string;
  urlPt?: string;
  urlNl?: string;
}

type LocaleSuffix = "Es" | "En" | "De" | "Fr" | "Pt" | "Nl";

/**
 * Our locale keys (en/pl/mx, th planned per CLAUDE.md) don't map 1:1 to
 * OrthoApnea's (Es/En/De/Fr/Pt/Nl — confirmed from a captured document list,
 * richer than the resources-list sample we designed the first version of
 * this file around). Each chain tries the closest language first, then
 * falls through the rest of OrthoApnea's languages rather than giving up —
 * showing *something* beats showing nothing for a resource that exists but
 * not in the user's own language. Revisit if a real th-speaking partner
 * appears and none of this fallback chain is acceptable to them.
 */
const LOCALE_FALLBACK: Record<string, LocaleSuffix[]> = {
  en: ["En", "Es", "De", "Fr", "Pt", "Nl"],
  mx: ["Es", "En", "Pt", "De", "Fr", "Nl"],
  pl: ["En", "Es", "De", "Fr", "Pt", "Nl"],
  th: ["En", "Es", "De", "Fr", "Pt", "Nl"],
};

/** Some rows have an empty string for a given language, not a missing key — falls through to the next language in the chain rather than accepting "". */
function pickLocalized(row: RawOrthoApneaResource, field: "title" | "description" | "url", locale: string): string {
  const chain = LOCALE_FALLBACK[locale] ?? LOCALE_FALLBACK.en;
  for (const suffix of chain) {
    const value = row[`${field}${suffix}` as keyof RawOrthoApneaResource];
    if (typeof value === "string" && value.trim()) return value;
  }
  if (field === "url" && row.url?.trim()) return row.url;
  return "";
}

async function fetchRawResources(): Promise<RawOrthoApneaResource[]> {
  const res = await authedFetch(RESOURCES_PATH);
  if (!res.ok) {
    throw new PartnerServiceError("orthoapnea", `resources fetch failed with status ${res.status}`);
  }
  return (await res.json()) as RawOrthoApneaResource[];
}

export async function fetchResources(locale: string): Promise<PartnerResourceItem[]> {
  const rows = await fetchRawResources();

  return rows
    .filter((row) => !row.deleted)
    .map((row): PartnerResourceItem => ({
      id: String(row.id),
      partner: "orthoapnea",
      kind: row.type === VIDEO_TYPE ? "video" : "document",
      title: pickLocalized(row, "title", locale),
      description: pickLocalized(row, "description", locale),
      mediaUrl: `/api/v1/partners/orthoapnea/resources/${row.id}/media?locale=${locale}`,
      category: row.category,
      weight: row.weight,
    }))
    .filter((item) => item.title) // no usable title in any language — not worth showing
    .sort((a, b) => a.weight - b.weight);
}

/** Resource id -> the video media path that actually worked, so repeat requests for the same video don't pay the two-path probe again. */
const resolvedVideoPathCache = new Map<string, string>();

async function tryVideoPaths(resourceId: string, filename: string): Promise<Response> {
  const encoded = encodeURIComponent(filename);
  const cached = resolvedVideoPathCache.get(resourceId);
  const candidates = cached
    ? [cached]
    : [`${TUTORIAL_VIDEO_MEDIA_PATH}/${encoded}`, `${DOC_VIDEO_MEDIA_PATH}/${encoded}`];

  let lastRes: Response | null = null;
  for (const path of candidates) {
    const res = await authedFetch(path);
    if (res.ok && res.body) {
      resolvedVideoPathCache.set(resourceId, path);
      return res;
    }
    lastRes = res;
  }
  console.error(`[orthoapnea] video fetch failed for resource '${resourceId}' on all known paths: ${candidates.join(", ")}`);
  throw new PartnerServiceError(
    "orthoapnea",
    `media fetch failed with status ${lastRes?.status} — tried ${candidates.join(", ")}`
  );
}

/** Streams the underlying file for one resource. Document path confirmed (DOCUMENT_MEDIA_PATH); video path resolved via tryVideoPaths (see its comment). */
export async function fetchResourceMedia(
  resourceId: string,
  locale: string
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string | null }> {
  const rows = await fetchRawResources();
  const raw = rows.find((r) => String(r.id) === resourceId && !r.deleted);
  if (!raw) {
    throw new PartnerServiceError("orthoapnea", `resource '${resourceId}' not found`);
  }

  const filename = pickLocalized(raw, "url", locale);
  if (!filename) {
    throw new PartnerServiceError("orthoapnea", `resource '${resourceId}' has no media file for locale '${locale}'`);
  }

  if (raw.type === VIDEO_TYPE) {
    const mediaRes = await tryVideoPaths(resourceId, filename);
    return { body: mediaRes.body as ReadableStream<Uint8Array>, contentType: mediaRes.headers.get("content-type") };
  }

  const mediaPath = `${DOCUMENT_MEDIA_PATH}/${encodeURIComponent(filename)}`;
  const mediaRes = await authedFetch(mediaPath);
  if (!mediaRes.ok || !mediaRes.body) {
    console.error(`[orthoapnea] document fetch failed with status ${mediaRes.status} for '${mediaPath}'`);
    throw new PartnerServiceError("orthoapnea", `media fetch failed with status ${mediaRes.status} for '${mediaPath}'`);
  }
  return { body: mediaRes.body, contentType: mediaRes.headers.get("content-type") };
}
