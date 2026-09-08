import { ORTHOAPNEA_BASE_URL, ORTHOAPNEA_EMAIL, ORTHOAPNEA_PASSWORD } from "../../env.js";
import { PartnerServiceError, ConflictError } from "../../errors.js";
import { getPatientById } from "../../db/patient.js";
import { withTenant } from "../../db/tenant.js";
import {
  getPartnerLink,
  ensurePendingPartnerLink,
  markPartnerLinkSynced,
  markPartnerLinkFailed,
  updatePartnerLinkStatus,
  insertPartnerTransaction,
  type PartnerLink,
  type InsertPartnerTransactionInput,
} from "../../db/partnerLink.js";
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
 * Scope of this file: resources (documents/videos) below, plus order
 * submission (patient + treatment create, status polling) further down.
 * Every mutating call is serialized through enqueueOrthoApneaMutation() —
 * OrthoApnea's shared-account session behaves like a stateful cart, so two
 * concurrent creates could race on it. Every create/poll call is also logged
 * to `partner_transaction` (migration 018) with the exact request/response
 * JSON and a validation report — see validatePartnerResponse() below — since
 * this whole integration is reverse-engineered against production with no
 * official docs, and every call needs to be auditable end-to-end.
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

/**
 * Test-only: clears the module-level session/cooldown state. session,
 * lastLoginFailureAt etc. are deliberately process-wide singletons in
 * production (one real Node process talks to OrthoApnea through one cached
 * session/circuit-breaker) — but that same singleton leaks across test
 * cases within a single spec file that statically imports this module once,
 * since vitest doesn't reset module state between `it()` blocks on its own.
 * orthoapnea.spec.ts avoids this by dynamically re-importing the module
 * (with vi.resetModules()) per test; orthoapnea-order.spec.ts's tests are
 * DB-integration tests that can't cheaply do that (the DB-touching command
 * functions are imported statically alongside this), so they call this
 * instead. Not imported or called anywhere in production code.
 */
export function __resetOrthoApneaStateForTests(): void {
  session = null;
  loginInFlight = null;
  lastLoginFailureAt = null;
  consecutiveFailures = 0;
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

/**
 * OrthoApnea's own uptime/latency is entirely outside our control — a hung
 * connection with no timeout would block the calling request (or, for the
 * sync job, that one link's iteration) indefinitely. 20s is generous enough
 * for a slow real response but short enough that a rep isn't left staring at
 * a spinner forever. Deliberately NOT tied to holding a DB transaction open
 * (see the transaction-decoupling comments on ensureOrthoApneaPatient et al.
 * below) — this matters on its own even with a clean split between DB work
 * and the HTTP call.
 */
const FETCH_TIMEOUT_MS = 20_000;

async function authedFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const { token } = await ensureSession();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${ORTHOAPNEA_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new PartnerServiceError("orthoapnea", `request to ${path} timed out after ${FETCH_TIMEOUT_MS}ms`, cause);
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
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

// =============================================================================
// Order submission — patient create, treatment create, status polling.
// =============================================================================

const PARTNER_NAME = "orthoapnea";
const PATIENT_CREATE_PATH = "/api/patient";
const TREATMENT_CREATE_PATH = "/api/treatments";
/**
 * OrthoApnea's own literal path segment — "DTO" is their route naming
 * (confirmed verbatim from a captured network request during the live
 * reverse-engineering session), not ours; kept out of our own function and
 * variable names on purpose so it doesn't propagate as unexplained jargon.
 */
const TREATMENT_DETAIL_PATH = "/api/treatments/DTO";
const COUNTRIES_PATH = "/api/countries";

/**
 * Serializes every mutating OrthoApnea call (patient/treatment create)
 * through a single in-process chain — see the file header comment for why.
 * Read-only calls (resources, status polls) are NOT queued.
 *
 * Open door: this only works because Render runs exactly one instance of
 * this process. If that ever changes (horizontal scaling), this in-memory
 * queue stops being sufficient and would need to become DB-backed — not
 * solved here, just flagged.
 */
let mutationQueue: Promise<unknown> = Promise.resolve();

function enqueueOrthoApneaMutation<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(fn, fn);
  // Swallow so one failed mutation doesn't poison the chain for the next caller.
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export interface OrthoApneaCountry {
  id: number;
  code: string;
  es?: string;
  en?: string;
}

const COUNTRIES_CACHE_TTL_MS = 60 * 60 * 1000;
let countriesCache: { rows: OrthoApneaCountry[]; fetchedAt: number } | null = null;

/** Exported for the wizard's "Dirección alternativa" country select — resolveCountryId() below is the internal (patient-ensure) consumer. */
export async function fetchCountries(): Promise<OrthoApneaCountry[]> {
  if (countriesCache && Date.now() - countriesCache.fetchedAt < COUNTRIES_CACHE_TTL_MS) {
    return countriesCache.rows;
  }
  const res = await authedFetch(COUNTRIES_PATH);
  if (!res.ok) throw new PartnerServiceError(PARTNER_NAME, `countries fetch failed with status ${res.status}`);
  const rows = (await res.json()) as OrthoApneaCountry[];
  countriesCache = { rows, fetchedAt: Date.now() };
  return rows;
}

/** Maps an ISO2 country code to OrthoApnea's own internal countryId (their ids don't match dropdown position — see fetchCountries()). Returns null (silently) if unmapped rather than failing the whole patient-create call over a non-required field. */
async function resolveCountryId(isoCode: string | null | undefined): Promise<number | null> {
  if (!isoCode) return null;
  try {
    const rows = await fetchCountries();
    return rows.find((c) => c.code?.toUpperCase() === isoCode.toUpperCase())?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Per-action baseline of top-level fields we expect back from OrthoApnea.
 * `create_patient` is now confirmed via a real POST /api/patient capture
 * (id 42824, "Test Integration DO NOT USE" — same shape as GET /api/patient/:id).
 * `status_poll` is the fully confirmed 106-field treatment DTO.
 */
const EXPECTED_RESPONSE_FIELDS: Record<string, string[]> = {
  create_patient: [
    "id", "name", "email", "identityNumber", "insuranceNumber", "signupDate", "birthDate",
    "male", "phone", "countryId", "province", "city", "address", "postalCode", "observations",
    "user", "creator", "treatments", "diagnosis", "profession", "observer",
    "userDiagnosis", "userDiagnosisSignupDate", "customerId", "clinicId",
  ],
  create_treatment: [
    "id", "statusId", "patientId", "patientName", "clinicName", "product",
    "requestDate", "expectedDeliveryDate", "editable", "paid", "billed",
  ],
  add_comment: [
    "id", "action", "type", "note", "receiverRole", "creationDate", "treatmentId", "emailed",
  ],
  status_poll: [
    "id", "user", "creator", "responsible", "observer", "customerId", "customerCountryId",
    "clinic", "customerName", "patientName", "clinicName", "product", "statusId",
    "lastActivity", "desiredDate", "teethStatus", "observations", "requestDate",
    "expectedDeliveryDate", "multimedias", "collectionRequest", "notifications",
    "histories", "promotionCode", "editable", "patientId", "camType", "verticalDimension",
    "retrusionMax", "protrusionMax", "startingPoint", "theramonNeeded", "maxOpening",
    "sequenceTypeStandard", "sequenceTypePersonalized", "sequenceUnitInMM", "sequence",
    "collectionAddress", "deliveryAddress", "facialBiotype", "deviationRight",
    "deviationAdvanceRight", "deviationLeft", "deviationAdvanceLeft", "laterality",
    "limitOpening", "anteriorFrontalOpening", "mixedSplintDesign",
    "scallopedSplintDesign", "slotsForElasticBands", "upperBandSplintDesign",
    "lowerBandSplintDesign", "scannerPlatform", "scannerTreatment", "fsDoctorId",
    "sendByMRW", "collectByMRW", "sendByUPS", "collectByUPS", "parentTreatmentId",
    "archived", "estimate", "modelPrintStatusId", "digitalFiles", "invoiceId", "paid",
    "billed", "doctorFirstTreatment", "insuranceNumber", "morningAligner",
    "noContactDoctorForRedesign", "repairCauseUpperId", "repairCauseLowerId",
    "michiganTypeOfGuide", "michiganMaterial", "upperSplint", "lowerSplint", "rate",
    "attachments", "doctorCriteria", "commercialCriteria", "paymentOption",
    "accessories", "total",
  ],
};

export interface PartnerValidationReport {
  missingFields: string[];
  unexpectedTopLevelFields: string[];
  // Index signature so this is directly assignable to the JSONB-backed
  // Record<string, unknown> fields on InsertPartnerTransactionInput.
  [key: string]: unknown;
}

/**
 * Compares a captured response against the expected-fields baseline for that
 * action. `missingFields` is the real red flag (OrthoApnea silently renamed
 * or removed something we depend on); `unexpectedTopLevelFields` is purely
 * informational (they added something new). Stored on every
 * `partner_transaction` row rather than just logged, so a discrepancy is
 * queryable after the fact, not just visible in server logs at the moment it
 * happened.
 */
export function validatePartnerResponse(
  action: string,
  payload: Record<string, unknown> | null | undefined
): PartnerValidationReport {
  const expected = EXPECTED_RESPONSE_FIELDS[action];
  if (!expected || !payload) return { missingFields: [], unexpectedTopLevelFields: [] };
  const actualKeys = Object.keys(payload);
  return {
    missingFields: expected.filter((f) => !actualKeys.includes(f)),
    unexpectedTopLevelFields: actualKeys.filter((k) => !expected.includes(k)),
  };
}

/** Reads and JSON-parses a response body defensively — a non-JSON or empty body must not throw past the transaction-logging code below. */
async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Records one partner_transaction row and logs it — the log line is a
 * deliberate, structured breadcrumb (action / link id / success / http
 * status) so a manual test session can watch these happen live in server
 * logs, not just query the DB after the fact (see ADR-017). Every call site
 * below the transaction-decoupling boundary funnels through this one
 * function precisely so that breadcrumb can't be forgotten on a new call
 * site.
 */
async function logPartnerTransaction(
  client: Parameters<typeof insertPartnerTransaction>[0],
  input: InsertPartnerTransactionInput
) {
  const row = await insertPartnerTransaction(client, input);
  console.log(
    `[orthoapnea] partner_transaction action=${input.action} partner_link_id=${input.partner_link_id} success=${input.success} http_status=${input.http_status ?? "n/a"}`
  );
  return row;
}

/**
 * Ensures a NeoSleep patient has a corresponding OrthoApnea patient, creating
 * one if needed. Idempotent — safe to call every time the order wizard
 * opens, per the product requirement that opening the form is what creates
 * the OA-side patient. Returns the OrthoApnea patient id either way.
 *
 * TRANSACTION SHAPE (see ADR-017): this used to run entirely inside one
 * withTenant() transaction, holding a pooled Postgres connection open for the
 * full duration of the OrthoApnea HTTP round-trip. Now it's three phases —
 * short transaction (read/ensure-pending-link) → the HTTP call with NO
 * transaction open → short transaction (record the outcome) — so a slow or
 * hung partner API never pins a DB connection.
 */
export async function ensureOrthoApneaPatient(tenantSlug: string, patientId: string): Promise<string> {
  const setup = await withTenant(tenantSlug, async (client) => {
    const existing = await getPartnerLink(client, PARTNER_NAME, "patient", patientId);
    if (existing?.external_id) return { done: true as const, externalId: existing.external_id };

    const link = await ensurePendingPartnerLink(client, PARTNER_NAME, "patient", patientId);
    const patient = await getPatientById(client, patientId);
    if (!patient) throw new PartnerServiceError(PARTNER_NAME, `local patient '${patientId}' not found`);
    return { done: false as const, link, patient };
  });

  if (setup.done) return setup.externalId;
  const { link, patient } = setup;

  // NOTE: `patient.region` is a territory code (e.g. "PL"/"MX"), used here as
  // a best-effort ISO2 guess for OrthoApnea's countryId mapping — still not
  // verified against a real create call (the live-capture round confirmed
  // the PAYLOAD SHAPE below, but the actual country used in every captured
  // example was Mexico (id 29), never cross-checked against a non-MX patient).
  const countryId = await resolveCountryId(patient.region);
  const userId = await resolveCurrentUserId().catch(() => null);

  // Confirmed verbatim from a live capture (PUT /api/patient for an edit,
  // POST /api/patient for a create — same shape, POST just omits `id`):
  // name, email, identityNumber, insuranceNumber, birthDate, male, phone,
  // countryId, province, city, address, postalCode, userId, profession.
  // Our own `patient` table has no equivalent for identityNumber/
  // insuranceNumber/birthDate/male/province/address/postalCode/profession —
  // those genuinely don't exist in our schema yet, so they're sent empty
  // ("") to match the confirmed shape rather than omitted (OrthoApnea's own
  // captured examples send "" for unknown fields, not a missing key).
  const requestPayload: Record<string, unknown> = {
    name: [patient.first_name, patient.last_name].filter(Boolean).join(" "),
    email: patient.email ?? "",
    identityNumber: "",
    insuranceNumber: "",
    birthDate: "",
    male: "",
    phone: patient.phone ?? "",
    countryId: countryId ?? undefined,
    province: "",
    city: "",
    address: "",
    postalCode: "",
    // resolveCurrentUserId() returns a string (it's also used to build query
    // strings elsewhere) — the confirmed captured payload has userId as a
    // JSON number, not a numeric string.
    userId: userId != null ? Number(userId) : undefined,
    profession: "",
  };

  let response: Response;
  try {
    response = await enqueueOrthoApneaMutation(() =>
      authedFetch(PATIENT_CREATE_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      })
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await withTenant(tenantSlug, async (client) => {
      await logPartnerTransaction(client, {
        partner_link_id: link.id,
        action: "create_patient",
        request_payload: requestPayload,
        success: false,
        error_message: message,
      });
      await markPartnerLinkFailed(client, link.id, message);
    });
    throw cause;
  }

  const httpStatus = response.status;
  const responsePayload = await safeJson(response);
  const success = response.ok && typeof responsePayload?.id !== "undefined";
  const validationReport = validatePartnerResponse("create_patient", responsePayload);

  const externalId = await withTenant(tenantSlug, async (client) => {
    await logPartnerTransaction(client, {
      partner_link_id: link.id,
      action: "create_patient",
      request_payload: requestPayload,
      response_payload: responsePayload,
      http_status: httpStatus,
      success,
      validation_report: validationReport,
      error_message: success ? null : `unexpected response (status ${httpStatus})`,
    });

    if (!success) {
      await markPartnerLinkFailed(client, link.id, `create_patient failed with status ${httpStatus}`);
      return null;
    }

    const id = String(responsePayload!.id);
    await markPartnerLinkSynced(client, link.id, id, null);
    return id;
  });

  if (externalId === null) {
    throw new PartnerServiceError(PARTNER_NAME, `patient creation failed with status ${httpStatus}`);
  }
  return externalId;
}

export interface CreateOrthoApneaTreatmentResult {
  externalId: string;
  externalStatus: string | null;
  responsePayload: Record<string, unknown> | null;
}

/**
 * Creates a treatment order in OrthoApnea mirroring the local treatment_plan
 * row. `wizardPayload` is expected to use OrthoApnea's own field names
 * verbatim (see the implementation plan's field-mapping table) — this
 * function is a thin, auditable pass-through, not a translation layer.
 *
 * Guards against double-submission: unlike ensureOrthoApneaPatient (a plain
 * "ensure it exists" that's safe to call repeatedly), an order create is not
 * idempotent on OrthoApnea's side as far as we know — calling this twice for
 * the same treatment_plan would create two real, billable orders. A prior
 * *failed* attempt is still retried (its link has no external_id yet).
 *
 * Residual risk (documented, not solved here): the "already synced?" check
 * and the actual API call are not atomic, so two truly concurrent first-time
 * calls for the same treatment_plan could both pass the check before either
 * finishes — enqueueOrthoApneaMutation still serializes the two API calls,
 * but does not prevent the second one from happening. A page double-click or
 * accidental resubmit (the common real-world case) is fully covered; a
 * proper fix for the race would need a DB-level lock keyed by
 * treatmentPlanId (e.g. pg_advisory_xact_lock), not implemented here.
 *
 * TRANSACTION SHAPE (see ADR-017): same three-phase split as
 * ensureOrthoApneaPatient — short transaction (duplicate check + ensure
 * pending link), HTTP call with no transaction open, short transaction
 * (record the outcome).
 */
export async function createOrthoApneaTreatment(
  tenantSlug: string,
  treatmentPlanId: string,
  wizardPayload: Record<string, unknown>
): Promise<CreateOrthoApneaTreatmentResult> {
  const link = await withTenant(tenantSlug, async (client) => {
    const existing = await getPartnerLink(client, PARTNER_NAME, "treatment_plan", treatmentPlanId);
    if (existing?.external_id) {
      throw new ConflictError(
        `treatment_plan '${treatmentPlanId}' was already submitted to OrthoApnea (external id '${existing.external_id}')`
      );
    }
    return ensurePendingPartnerLink(client, PARTNER_NAME, "treatment_plan", treatmentPlanId);
  });

  let response: Response;
  try {
    response = await enqueueOrthoApneaMutation(() =>
      authedFetch(TREATMENT_CREATE_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wizardPayload),
      })
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await withTenant(tenantSlug, async (client) => {
      await logPartnerTransaction(client, {
        partner_link_id: link.id,
        action: "create_treatment",
        request_payload: wizardPayload,
        success: false,
        error_message: message,
      });
      await markPartnerLinkFailed(client, link.id, message);
    });
    throw cause;
  }

  const httpStatus = response.status;
  const responsePayload = await safeJson(response);
  const success = response.ok && typeof responsePayload?.id !== "undefined";
  const validationReport = validatePartnerResponse("create_treatment", responsePayload);

  const outcome = await withTenant(tenantSlug, async (client) => {
    await logPartnerTransaction(client, {
      partner_link_id: link.id,
      action: "create_treatment",
      request_payload: wizardPayload,
      response_payload: responsePayload,
      http_status: httpStatus,
      success,
      validation_report: validationReport,
      error_message: success ? null : `unexpected response (status ${httpStatus})`,
    });

    if (!success) {
      await markPartnerLinkFailed(client, link.id, `create_treatment failed with status ${httpStatus}`);
      return null;
    }

    const externalId = String(responsePayload!.id);
    const externalStatus = responsePayload!.statusId != null ? String(responsePayload!.statusId) : null;
    await markPartnerLinkSynced(client, link.id, externalId, externalStatus);
    return { externalId, externalStatus, responsePayload } satisfies CreateOrthoApneaTreatmentResult;
  });

  if (!outcome) {
    throw new PartnerServiceError(PARTNER_NAME, `treatment creation failed with status ${httpStatus}`);
  }
  return outcome;
}

const NOTIFICATIONS_PATH = "/api/notifications";

/**
 * Posts a comment to an ALREADY-SUBMITTED OrthoApnea order (their own
 * "Mensaje para OrthoApnea sobre el tratamiento" box on the order's recap
 * page — a `notifications` row, not part of the treatment object itself).
 *
 * CONFIRMED REAL SIDE EFFECT (live-capture session, response `emailed: true`):
 * this sends an actual email to OrthoApnea's technical team (`receiverRole:
 * "ROLE_TECHNICAL"`). It is NOT a silent internal note — every call here
 * notifies a human on their side. Callers (the route below) must treat this
 * as a deliberate, explicit action, never an automatic side effect of
 * saving a local note.
 *
 * Throws if the treatment_plan was never actually submitted to OrthoApnea
 * (no external_id yet) — there is nothing on their side to comment on.
 *
 * TRANSACTION SHAPE (see ADR-017): same three-phase split as the two
 * functions above — short transaction (look up the link), HTTP call with no
 * transaction open, short transaction (record the outcome).
 */
export async function addOrthoApneaComment(
  tenantSlug: string,
  treatmentPlanId: string,
  note: string
): Promise<{ notificationId: string; emailed: boolean }> {
  const link = await withTenant(tenantSlug, async (client) => {
    const found = await getPartnerLink(client, PARTNER_NAME, "treatment_plan", treatmentPlanId);
    if (!found?.external_id) {
      throw new PartnerServiceError(
        PARTNER_NAME,
        `treatment_plan '${treatmentPlanId}' has not been submitted to OrthoApnea yet — nothing to comment on`
      );
    }
    return found;
  });

  const userId = await resolveCurrentUserId();
  // Confirmed verbatim from a live capture (POST /api/notifications).
  const requestPayload: Record<string, unknown> = {
    id: null,
    userReceiverId: null,
    userSenderId: Number(userId),
    action: "MESSAGE",
    type: "MESSAGE_DOCTOR_TO_TECHNICAL",
    note,
    receiverRole: "ROLE_TECHNICAL",
    creationDate: null,
    readDate: null,
    readUserId: null,
    url: null,
    treatmentId: Number(link.external_id),
    files: false,
  };

  let response: Response;
  try {
    response = await enqueueOrthoApneaMutation(() =>
      authedFetch(NOTIFICATIONS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      })
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await withTenant(tenantSlug, (client) =>
      logPartnerTransaction(client, {
        partner_link_id: link.id,
        action: "add_comment",
        request_payload: requestPayload,
        success: false,
        error_message: message,
      })
    );
    throw cause;
  }

  const httpStatus = response.status;
  const responsePayload = await safeJson(response);
  const success = response.ok && typeof responsePayload?.id !== "undefined";
  const validationReport = validatePartnerResponse("add_comment", responsePayload);

  const outcome = await withTenant(tenantSlug, async (client) => {
    await logPartnerTransaction(client, {
      partner_link_id: link.id,
      action: "add_comment",
      request_payload: requestPayload,
      response_payload: responsePayload,
      http_status: httpStatus,
      success,
      validation_report: validationReport,
      error_message: success ? null : `unexpected response (status ${httpStatus})`,
    });

    if (!success) return null;
    return {
      notificationId: String(responsePayload!.id),
      emailed: responsePayload!.emailed === true,
    };
  });

  if (!outcome) {
    throw new PartnerServiceError(PARTNER_NAME, `comment failed with status ${httpStatus}`);
  }
  return outcome;
}

/**
 * OrthoApnea `statusId` values known to mean "nothing more will ever change"
 * — deliberately left empty until the consolidated live-capture round (or
 * enough observed orders) confirms which numeric statuses are actually
 * terminal (delivered/cancelled/etc. — only statusId 1, "Solicitud enviada",
 * has been observed so far). An empty list just means the sync job keeps
 * polling every linked treatment forever, which is safe (if wasteful) —
 * better than prematurely stopping status updates for a live order.
 */
export const ORTHOAPNEA_TERMINAL_STATUSES: string[] = [];

/**
 * Polls OrthoApnea for one treatment's current status, updates `partner_link`,
 * and records a `partner_transaction` row regardless of outcome (read-only —
 * not queued, only mutating calls need serialization). Returns whether the
 * status actually changed since the last poll, so the caller (the sync job)
 * knows whether to fire notifications.
 *
 * TRANSACTION SHAPE (see ADR-017): the HTTP call runs with no transaction
 * open; only recording the outcome (partner_transaction insert + partner_link
 * update) is wrapped in a short transaction. This matters even more here than
 * for the mutating calls above — SyncOrthoApneaTreatmentStatusesCommand calls
 * this once per linked treatment in a loop, and a transaction held across
 * that whole loop (the bug this fixes) would pin one DB connection for as
 * long as N sequential OrthoApnea round-trips take.
 */
export async function fetchOrthoApneaTreatmentStatus(
  tenantSlug: string,
  link: PartnerLink
): Promise<{ externalStatus: string | null; changed: boolean }> {
  if (!link.external_id) {
    throw new PartnerServiceError(PARTNER_NAME, "cannot poll status: partner_link has no external_id");
  }

  let response: Response;
  try {
    response = await authedFetch(
      `${TREATMENT_DETAIL_PATH}/${encodeURIComponent(link.external_id)}?updateDeliveryNote=false`
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await withTenant(tenantSlug, (client) =>
      logPartnerTransaction(client, {
        partner_link_id: link.id,
        action: "status_poll",
        success: false,
        error_message: message,
      })
    );
    throw cause;
  }

  const httpStatus = response.status;
  const responsePayload = await safeJson(response);
  const success = response.ok && responsePayload != null;
  const validationReport = validatePartnerResponse("status_poll", responsePayload);

  const outcome = await withTenant(tenantSlug, async (client) => {
    await logPartnerTransaction(client, {
      partner_link_id: link.id,
      action: "status_poll",
      response_payload: responsePayload,
      http_status: httpStatus,
      success,
      validation_report: validationReport,
      error_message: success ? null : `unexpected response (status ${httpStatus})`,
    });

    if (!success) return null;

    const externalStatus = responsePayload!.statusId != null ? String(responsePayload!.statusId) : null;
    const changed = externalStatus !== link.external_status;
    await updatePartnerLinkStatus(client, link.id, externalStatus);
    return { externalStatus, changed };
  });

  if (!outcome) {
    throw new PartnerServiceError(PARTNER_NAME, `status poll failed with status ${httpStatus}`);
  }
  return outcome;
}

// =============================================================================
// Read-through catalog data for the order wizard (products, clinics) — same
// TTL-cache pattern as fetchRawResources()/fetchCountries() above. Not
// queued: read-only.
// =============================================================================

const PRODUCTS_PATH = "/api/products";
const CLINICS_PATH = "/api/clinics";
const CURRENT_USER_PATH = "/api/user/me";

export interface OrthoApneaProduct {
  id: number;
  code: string;
  nameEs: string;
  category: string;
}

export interface OrthoApneaClinic {
  id: number;
  name: string;
}

const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;
let productsCache: { rows: OrthoApneaProduct[]; fetchedAt: number } | null = null;
let clinicsCache: { rows: OrthoApneaClinic[]; fetchedAt: number } | null = null;
let currentUserIdCache: { id: string; fetchedAt: number } | null = null;

export async function fetchOrthoApneaProducts(): Promise<OrthoApneaProduct[]> {
  if (productsCache && Date.now() - productsCache.fetchedAt < CATALOG_CACHE_TTL_MS) return productsCache.rows;
  const res = await authedFetch(`${PRODUCTS_PATH}?page=0&size=1000`);
  if (!res.ok) throw new PartnerServiceError(PARTNER_NAME, `products fetch failed with status ${res.status}`);
  const body = (await res.json()) as { content?: OrthoApneaProduct[] } | OrthoApneaProduct[];
  const rows = Array.isArray(body) ? body : (body.content ?? []);
  productsCache = { rows, fetchedAt: Date.now() };
  return rows;
}

/**
 * The shared account represents one fixed OrthoApnea user/doctor persona —
 * `/api/clinics` needs that persona's own userId (not anything of ours), so
 * this resolves and caches it via `/api/user/me` first. Response shape is
 * unconfirmed beyond "has an id" (never captured in full) — tightens once
 * the consolidated live-capture round confirms it.
 */
async function resolveCurrentUserId(): Promise<string> {
  if (currentUserIdCache && Date.now() - currentUserIdCache.fetchedAt < CATALOG_CACHE_TTL_MS) {
    return currentUserIdCache.id;
  }
  const res = await authedFetch(CURRENT_USER_PATH);
  if (!res.ok) throw new PartnerServiceError(PARTNER_NAME, `current user fetch failed with status ${res.status}`);
  const body = (await res.json()) as { id?: number | string };
  if (body.id == null) throw new PartnerServiceError(PARTNER_NAME, "current user response has no id field");
  const id = String(body.id);
  currentUserIdCache = { id, fetchedAt: Date.now() };
  return id;
}

export async function fetchOrthoApneaClinics(): Promise<OrthoApneaClinic[]> {
  if (clinicsCache && Date.now() - clinicsCache.fetchedAt < CATALOG_CACHE_TTL_MS) return clinicsCache.rows;
  const userId = await resolveCurrentUserId();
  const res = await authedFetch(`${CLINICS_PATH}?userId=${encodeURIComponent(userId)}&deleted=false`);
  if (!res.ok) throw new PartnerServiceError(PARTNER_NAME, `clinics fetch failed with status ${res.status}`);
  const body = (await res.json()) as { content?: OrthoApneaClinic[] } | OrthoApneaClinic[];
  const rows = Array.isArray(body) ? body : (body.content ?? []);
  clinicsCache = { rows, fetchedAt: Date.now() };
  return rows;
}
