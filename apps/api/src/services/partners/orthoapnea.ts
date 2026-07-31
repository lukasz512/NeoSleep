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
 * Login (LOGIN_PATH, Basic-auth scheme, JWT response) is confirmed from a
 * captured request/response pair — see below. Resource + media paths
 * (RESOURCES_PATH, DOCUMENT_MEDIA_PATH, TUTORIAL_VIDEO_MEDIA_PATH,
 * DOC_VIDEO_MEDIA_PATH) are confirmed too, from captured page renders.
 * Every login attempt (success/failure) is still logged via console —
 * useful once order submission is built against the same session.
 */

const LOGIN_PATH = "/api/login";
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
  /** From the JWT's `exp` claim (unix seconds -> ms). Falls back to a conservative 30min if the token has no exp for some reason. */
  expiresAt: number;
}

/** JWTs are `header.payload.signature` — the payload is base64url JSON, no verification needed since we're only reading our own freshly-issued token. */
function decodeJwtExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf-8");
    const { exp } = JSON.parse(json) as { exp?: number };
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

const FALLBACK_SESSION_TTL_MS = 30 * 60 * 1000;
/** After a failed login, don't hammer OrthoApnea again for this long — a rep bouncing between routes while OrthoApnea is down shouldn't trigger a login attempt on every navigation. */
const RECONNECT_COOLDOWN_MS = 15_000;
/** After this many consecutive failed logins, checkConnection() reports `attemptsExhausted` so the frontend can switch from "retrying" to "this looks like a real outage" messaging. Still keeps retrying on the same cooldown — a doctor's reload can't fix a server-side outage, but OrthoApnea coming back on its own shouldn't require one either. */
const MAX_CONSECUTIVE_FAILURES = 3;

let session: OrthoApneaSession | null = null;
let loginInFlight: Promise<OrthoApneaSession> | null = null;
let lastLoginFailureAt: number | null = null;
let consecutiveFailures = 0;

function isSessionValid(s: OrthoApneaSession): boolean {
  return s.expiresAt > Date.now();
}

async function login(): Promise<OrthoApneaSession> {
  if (!ORTHOAPNEA_EMAIL || !ORTHOAPNEA_PASSWORD) {
    throw new PartnerServiceError("orthoapnea", "ORTHOAPNEA_EMAIL / ORTHOAPNEA_PASSWORD not configured");
  }

  // Confirmed from a captured request: POST with no body, credentials via
  // HTTP Basic auth (not a JSON body) — matches apneadock.es's Angular client.
  const basicAuth = Buffer.from(`${ORTHOAPNEA_EMAIL}:${ORTHOAPNEA_PASSWORD}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${ORTHOAPNEA_BASE_URL}${LOGIN_PATH}`, {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}` },
    });
  } catch (cause) {
    console.error("[orthoapnea] login request failed (network error):", cause);
    throw new PartnerServiceError("orthoapnea", "login request failed (network error)", cause);
  }
  if (!res.ok) {
    console.error(`[orthoapnea] login failed with status ${res.status}`);
    throw new PartnerServiceError("orthoapnea", `login failed with status ${res.status}`);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    console.error("[orthoapnea] login response did not contain a token field:", data);
    throw new PartnerServiceError("orthoapnea", "login response did not contain a token field");
  }
  const expiresAt = decodeJwtExpiry(data.token) ?? Date.now() + FALLBACK_SESSION_TTL_MS;
  console.log(`[orthoapnea] login succeeded, session valid until ${new Date(expiresAt).toISOString()}`);
  return { token: data.token, expiresAt };
}

/**
 * De-duped: concurrent callers during a cold start all await the same
 * in-flight login instead of triggering N logins. Also the single place
 * that decides "are we connected" — checkConnection() below just wraps this.
 */
async function ensureSession(): Promise<OrthoApneaSession> {
  if (session && isSessionValid(session)) return session;
  session = null;

  if (lastLoginFailureAt && Date.now() - lastLoginFailureAt < RECONNECT_COOLDOWN_MS) {
    throw new PartnerServiceError("orthoapnea", "connection recently failed — cooling down before retrying");
  }

  if (!loginInFlight) {
    loginInFlight = login()
      .then((s) => {
        session = s;
        lastLoginFailureAt = null;
        consecutiveFailures = 0;
        return s;
      })
      .catch((err: unknown) => {
        lastLoginFailureAt = Date.now();
        consecutiveFailures += 1;
        throw err;
      })
      .finally(() => {
        loginInFlight = null;
      });
  }
  return loginInFlight;
}

export interface ConnectionStatus {
  connected: boolean;
  /** True once MAX_CONSECUTIVE_FAILURES has been hit without a successful login in between — signals "this isn't a blip" rather than "still trying". */
  attemptsExhausted: boolean;
}

/**
 * Cheap, non-throwing connection check — attempts a (re)connect if not
 * already connected (a no-op if the cached token is still valid), reports
 * success/failure rather than propagating the error. Meant to be polled on
 * navigation into any OrthoApnea-dependent view (see routes/partners/
 * orthoapnea-status.ts) — the same shape any future partner's status check
 * should follow: attempt-if-needed, never throw, just report connected.
 */
export async function checkConnection(): Promise<ConnectionStatus> {
  try {
    await ensureSession();
    return { connected: true, attemptsExhausted: false };
  } catch {
    return { connected: false, attemptsExhausted: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES };
  }
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

/**
 * apneadock.es's own category/subcategory labels are NOT in the /api/resources
 * JSON (that only has numeric `category`/`subcategory` fields with no name
 * anywhere in the response) — they're baked into the Angular template as
 * plain text. This table was built by cross-referencing captured page HTML
 * (which has the labels) against the JSON dump (which has stable `id`s) —
 * every id below is a confirmed match by title, not a guess. Keyed by id
 * rather than the numeric category/subcategory fields because we never
 * captured what those numbers mean, only which id sits under which visible
 * heading. New resources OrthoApnea adds later won't be in this table until
 * someone adds them — they fall back to UNKNOWN_CATEGORY rather than being
 * hidden.
 */
const UNKNOWN_CATEGORY = "Otros";
const RESOURCE_CATEGORY_BY_ID: Record<number, { category: string; subcategory?: string }> = {
  1: { category: "Documentación de interés" },
  2: { category: "Documentación de interés" },
  36: { category: "Manuales" },
  3: { category: "Protocolos" },
  4: { category: "Protocolos" },
  5: { category: "Protocolos" },
  6: { category: "Protocolos" },
  35: { category: "Protocolos" },
  33: { category: "Protocolos" }, // "Ficha de Paciente para Supervisión Previa a Solicitud del tratamiento OrthoApnea NOA"
  37: { category: "Protocolos" },
  44: { category: "Protocolos" }, // "Protocolo Clínico para la Selección de Pacientes Candidatos al Uso de Dispositivos de Avance Mandibular"
  53: { category: "Dispositivos", subcategory: "OrthoApnea" },
  7: { category: "Dispositivos", subcategory: "OrthoApnea NOA" },
  8: { category: "Dispositivos", subcategory: "OrthoApnea NOA" },
  9: { category: "Dispositivos", subcategory: "OrthoApnea NOA" },
  10: { category: "Dispositivos", subcategory: "OrthoApnea NOA" },
  11: { category: "Dispositivos", subcategory: "OrthoApnea NOA" },
  39: { category: "Dispositivos", subcategory: "OrthoApnea NOA" },
  12: { category: "Dispositivos", subcategory: "OrthoApnea Classic" },
  13: { category: "Dispositivos", subcategory: "OrthoApnea Classic" },
  40: { category: "Dispositivos", subcategory: "OrthoApnea Classic" },
  14: { category: "Dispositivos", subcategory: "Morning aligner" },
  15: { category: "Dispositivos", subcategory: "Morning aligner" },
  41: { category: "Dispositivos", subcategory: "Morning aligner" },
  16: { category: "Dispositivos", subcategory: "Orthobrux" },
  17: { category: "Dispositivos", subcategory: "Orthobrux" },
  18: { category: "Dispositivos", subcategory: "Orthobrux" },
  19: { category: "Dispositivos", subcategory: "Orthobrux" },
  20: { category: "Dispositivos", subcategory: "Orthobrux" },
  42: { category: "Dispositivos", subcategory: "Orthobrux" },
  21: { category: "Recursos gráficos" },
  22: { category: "Recursos gráficos" },
  23: { category: "Recursos gráficos" },
  24: { category: "Recursos gráficos" },
  56: { category: "Recursos gráficos" },
  57: { category: "Recursos gráficos" },
  58: { category: "Recursos gráficos" },
  25: { category: "Recursos gráficos", subcategory: "Branding" },
  // "Webinar" — the Videos-tab label the whole tutorial/webinar set sits
  // under (per direct confirmation, not the HTML cross-reference above).
  26: { category: "Webinar" },
  27: { category: "Webinar" },
  28: { category: "Webinar" },
  29: { category: "Webinar" },
  30: { category: "Webinar" },
  31: { category: "Webinar" },
  32: { category: "Webinar" },
  47: { category: "Webinar" },
  48: { category: "Webinar" },
  49: { category: "Webinar" },
  50: { category: "Webinar" },
  51: { category: "Webinar" },
  52: { category: "Webinar" },
  55: { category: "Webinar" },
  59: { category: "Webinar" },
};

const LANGUAGE_SUFFIXES: LocaleSuffix[] = ["Es", "En", "De", "Fr", "Pt", "Nl"];

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "svg", "gif", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm"]);

/** Extension of the *default resolved* file — a resource with different file types per language would be unusual for this catalog and isn't worth modeling. */
function detectFileType(filename: string): PartnerResourceItem["fileType"] {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "zip") return "zip";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "other";
}

/** Every language this specific row actually has content in — drives the flag/language-chip row, independent of the app-locale-resolved default (pickLocalized). */
function collectLanguageVariants(row: RawOrthoApneaResource, resourceId: number): PartnerResourceItem["languages"] {
  return LANGUAGE_SUFFIXES.filter((suffix) => row[`url${suffix}` as keyof RawOrthoApneaResource]?.toString().trim())
    .map((suffix) => ({
      code: suffix.toLowerCase(),
      mediaUrl: `/api/v1/partners/orthoapnea/resources/${resourceId}/media?lang=${suffix}`,
    }));
}

/**
 * The resources catalog (documents/videos) barely changes — no need to hit
 * OrthoApnea on every request. Cached in memory with a TTL and refreshed
 * lazily on the first request after it expires, not on a background timer
 * (simpler, and this process may not stay warm between requests anyway on
 * Render's free tier). If the refresh itself fails, a stale cache is served
 * rather than surfacing an error — the catalog being an hour stale is a
 * non-event; OrthoApnea being briefly unreachable shouldn't take the whole
 * Resources tab down with it.
 */
const RESOURCES_CACHE_TTL_MS = 60 * 60 * 1000;
let rawResourcesCache: { rows: RawOrthoApneaResource[]; fetchedAt: number } | null = null;

async function fetchRawResources(): Promise<RawOrthoApneaResource[]> {
  if (rawResourcesCache && Date.now() - rawResourcesCache.fetchedAt < RESOURCES_CACHE_TTL_MS) {
    return rawResourcesCache.rows;
  }

  try {
    const res = await authedFetch(RESOURCES_PATH);
    if (!res.ok) throw new PartnerServiceError("orthoapnea", `resources fetch failed with status ${res.status}`);
    const rows = (await res.json()) as RawOrthoApneaResource[];
    rawResourcesCache = { rows, fetchedAt: Date.now() };
    return rows;
  } catch (err) {
    if (rawResourcesCache) {
      console.warn(
        `[orthoapnea] resources refresh failed, serving cache from ${new Date(rawResourcesCache.fetchedAt).toISOString()}:`,
        err
      );
      return rawResourcesCache.rows;
    }
    throw err;
  }
}

export async function fetchResources(locale: string): Promise<PartnerResourceItem[]> {
  const rows = await fetchRawResources();

  return rows
    .filter((row) => !row.deleted)
    .map((row): PartnerResourceItem => {
      const labels = RESOURCE_CATEGORY_BY_ID[row.id];
      const defaultFilename = pickLocalized(row, "url", locale);
      return {
        id: String(row.id),
        partner: "orthoapnea",
        kind: row.type === VIDEO_TYPE ? "video" : "document",
        title: pickLocalized(row, "title", locale),
        description: pickLocalized(row, "description", locale),
        mediaUrl: `/api/v1/partners/orthoapnea/resources/${row.id}/media?locale=${locale}`,
        fileType: row.type === VIDEO_TYPE ? "video" : detectFileType(defaultFilename),
        languages: collectLanguageVariants(row, row.id),
        category: labels?.category ?? UNKNOWN_CATEGORY,
        subcategory: labels?.subcategory ?? null,
        weight: row.weight,
      };
    })
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

/**
 * Streams the underlying file for one resource. `lang`, when given, is one
 * of OrthoApnea's own suffixes (Es/En/De/Fr/Pt/Nl — from a language chip
 * click) and picks that exact variant; otherwise falls back through
 * `locale` (app-locale resolution, for the default tile click). Document
 * path confirmed (DOCUMENT_MEDIA_PATH); video path resolved via
 * tryVideoPaths (see its comment).
 */
export async function fetchResourceMedia(
  resourceId: string,
  locale: string,
  lang?: string
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string | null }> {
  const rows = await fetchRawResources();
  const raw = rows.find((r) => String(r.id) === resourceId && !r.deleted);
  if (!raw) {
    throw new PartnerServiceError("orthoapnea", `resource '${resourceId}' not found`);
  }

  const requestedSuffix = LANGUAGE_SUFFIXES.find((s) => s.toLowerCase() === lang?.toLowerCase());
  const filename = requestedSuffix
    ? raw[`url${requestedSuffix}` as keyof RawOrthoApneaResource]?.toString().trim()
    : pickLocalized(raw, "url", locale);
  if (!filename) {
    throw new PartnerServiceError(
      "orthoapnea",
      `resource '${resourceId}' has no media file for ${requestedSuffix ? `language '${lang}'` : `locale '${locale}'`}`
    );
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
