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
 */

const LOGIN_PATH = "/api/auth/login";
const RESOURCES_PATH = "/api/resources";
/** Confirmed from a captured page render — tutorial/product videos live here. Document paths are NOT confirmed (see fetchMedia). */
const VIDEO_MEDIA_PATH = "/media/video/tutorials";
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
    throw new PartnerServiceError("orthoapnea", "login request failed (network error)", cause);
  }
  if (!res.ok) {
    throw new PartnerServiceError("orthoapnea", `login failed with status ${res.status}`);
  }

  const data = (await res.json()) as { token?: string; accessToken?: string };
  const token = data.token ?? data.accessToken;
  if (!token) {
    throw new PartnerServiceError("orthoapnea", "login response did not contain a recognizable token field");
  }
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
  descriptionEs?: string;
  descriptionEn?: string;
  descriptionDe?: string;
  url?: string;
  urlEs?: string;
  urlEn?: string;
  urlDe?: string;
  urlFr?: string;
}

type LocaleSuffix = "Es" | "En" | "De" | "Fr";

/** Our locale keys (en/pl/mx) don't map 1:1 to OrthoApnea's (Es/En/De/Fr) — pl and mx fall back through the closest available language. */
const LOCALE_FALLBACK: Record<string, LocaleSuffix[]> = {
  en: ["En", "Es"],
  mx: ["Es", "En"],
  pl: ["En", "Es"],
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

/**
 * Streams the underlying file for one resource. Only the video path is
 * confirmed (VIDEO_MEDIA_PATH, from a captured page render) — the document
 * path below is an unverified guess (`/media/<urlXx>`). If documents 404,
 * capture the real download request from apneadock.es and fix the path here.
 */
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
  const mediaPath = raw.type === VIDEO_TYPE ? `${VIDEO_MEDIA_PATH}/${filename}` : `/media/${filename}`;

  const mediaRes = await authedFetch(mediaPath);
  if (!mediaRes.ok || !mediaRes.body) {
    throw new PartnerServiceError("orthoapnea", `media fetch failed with status ${mediaRes.status} for '${mediaPath}'`);
  }
  return { body: mediaRes.body, contentType: mediaRes.headers.get("content-type") };
}
