import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import { resolveVideoSource, type VideoSource } from "./orthoapnea.js";
import { uploadPartnerDocument, downloadPartnerDocument } from "../partnerDocuments.js";

/**
 * Poster frame + duration for OrthoApnea videos (NEO-151, idea A).
 *
 * OrthoApnea's catalog has no thumbnails, so every tile was a black box.
 * ffmpeg reads only the bytes it needs from apneadock.es (the index + one
 * frame, via Range requests), never the whole 580 MB file. The result is a
 * ~40 KB JPEG — derived data, not a copy of the video, which keeps the
 * "no stored partner files" decision (ADR-015 discussion).
 *
 * Three cache layers: memory (per process) → Supabase Storage (survives
 * Cloud Run restarts, keyed by the file's name + size so a replaced video
 * gets a new poster) → ffmpeg. Generation runs one at a time: each ffmpeg
 * holds a decoder in memory and the list warms every video at once.
 */

export interface Poster {
  jpeg: Uint8Array;
  durationSec: number | null;
}

export interface PosterDeps {
  ffmpegPath: string | null;
  resolveSource: (resourceId: string, locale: string) => Promise<VideoSource>;
  runFfmpeg: (args: string[]) => Promise<{ code: number | null; stdout: Buffer; stderr: string }>;
  storageGet: (path: string) => Promise<Uint8Array | null>;
  storagePut: (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;
}

const FFMPEG_TIMEOUT_MS = 60_000;
const STORAGE_PREFIX = "resource-posters/orthoapnea";
/** 640 px wide covers a 3-column desktop tile at 2× density. */
const POSTER_WIDTH = 640;

function defaultRunFfmpeg(path: string) {
  return (args: string[]) =>
    new Promise<{ code: number | null; stdout: Buffer; stderr: string }>((resolve, reject) => {
      const child = spawn(path, args, { stdio: ["ignore", "pipe", "pipe"] });
      const out: Buffer[] = [];
      let err = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
      child.stdout.on("data", (d: Buffer) => out.push(d));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout: Buffer.concat(out), stderr: err });
      });
    });
}

const defaultDeps: PosterDeps = {
  ffmpegPath: ffmpegStatic,
  resolveSource: resolveVideoSource,
  runFfmpeg: (args) => defaultRunFfmpeg(ffmpegStatic ?? "ffmpeg")(args),
  storageGet: async (path) => {
    try {
      return await downloadPartnerDocument(path);
    } catch {
      return null;
    }
  },
  storagePut: async (path, bytes, contentType) => {
    await uploadPartnerDocument(path, bytes, contentType);
  },
};

let deps: PosterDeps = defaultDeps;

/** "Duration: 00:58:12.34" from ffmpeg's input banner → seconds. */
export function parseDurationSec(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  const total = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return total > 0 ? Math.round(total) : null;
}

/** 10% in skips the black intro/title card most webinars open with; short clips still get a frame after the first second. */
export function frameTimestampSec(durationSec: number | null): number {
  if (!durationSec) return 5;
  return Math.max(1, Math.min(durationSec * 0.1, durationSec - 1));
}

function storagePath(resourceId: string, version: string, ext: "jpg" | "json"): string {
  const hash = createHash("sha1").update(version).digest("hex").slice(0, 16);
  return `${STORAGE_PREFIX}/${resourceId}/${hash}.${ext}`;
}

function headerArgs(source: VideoSource): string[] {
  const lines = Object.entries(source.headers).map(([k, v]) => `${k}: ${v}\r\n`).join("");
  return lines ? ["-headers", lines] : [];
}

async function generate(source: VideoSource): Promise<Poster> {
  // Pass 1: the input banner carries the duration (ffmpeg exits non-zero: no output given).
  const probe = await deps.runFfmpeg(["-hide_banner", ...headerArgs(source), "-i", source.url]);
  const durationSec = parseDurationSec(probe.stderr);

  // Pass 2: seek (input-side, so only the needed bytes are fetched) and encode one frame.
  const grab = await deps.runFfmpeg([
    "-hide_banner",
    "-loglevel", "error",
    "-ss", frameTimestampSec(durationSec).toFixed(1),
    ...headerArgs(source),
    "-i", source.url,
    "-frames:v", "1",
    "-vf", `scale=${POSTER_WIDTH}:-2`,
    "-q:v", "5",
    "-f", "image2",
    "-c:v", "mjpeg",
    "pipe:1",
  ]);
  if (grab.code !== 0 || grab.stdout.length === 0) {
    throw new Error(`ffmpeg frame grab failed (code ${grab.code}): ${grab.stderr.slice(-300)}`);
  }
  return { jpeg: new Uint8Array(grab.stdout), durationSec };
}

const memory = new Map<string, Poster>();
/** Duration per resource id, for the list response — filled whenever a poster is loaded or made. */
const durations = new Map<string, number>();
const inFlight = new Map<string, Promise<Poster | null>>();
const failedAt = new Map<string, number>();
/** A video that failed (partner down, odd codec) isn't retried on every tile render. */
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function loadOrMake(resourceId: string, locale: string): Promise<Poster | null> {
  const source = await deps.resolveSource(resourceId, locale);
  const key = `${resourceId}|${source.version}`;
  const cached = memory.get(key);
  if (cached) return cached;

  const jpgPath = storagePath(resourceId, source.version, "jpg");
  const stored = await deps.storageGet(jpgPath);
  if (stored) {
    const meta = await deps.storageGet(storagePath(resourceId, source.version, "json"));
    let durationSec: number | null = null;
    try {
      durationSec = meta ? (JSON.parse(new TextDecoder().decode(meta)) as { durationSec: number | null }).durationSec : null;
    } catch {
      durationSec = null;
    }
    const poster = { jpeg: stored, durationSec };
    remember(resourceId, key, poster);
    return poster;
  }

  const poster = await serialized(() => generate(source));
  remember(resourceId, key, poster);
  // Best effort: a Storage hiccup only costs a regeneration after the next restart.
  try {
    await deps.storagePut(jpgPath, poster.jpeg, "image/jpeg");
    await deps.storagePut(
      storagePath(resourceId, source.version, "json"),
      new TextEncoder().encode(JSON.stringify({ durationSec: poster.durationSec })),
      "application/json"
    );
  } catch (err) {
    console.warn(`[posters] storage upload failed for video '${resourceId}':`, err);
  }
  return poster;
}

function remember(resourceId: string, key: string, poster: Poster): void {
  memory.set(key, poster);
  if (poster.durationSec) durations.set(resourceId, poster.durationSec);
}

/** The poster for one video, or null when it can't be made (no ffmpeg on this host, partner down) — the tile then shows its fallback cover. */
export function getPoster(resourceId: string, locale: string): Promise<Poster | null> {
  if (!deps.ffmpegPath) return Promise.resolve(null);
  const last = failedAt.get(resourceId);
  if (last && Date.now() - last < FAILURE_COOLDOWN_MS) return Promise.resolve(null);

  const flightKey = `${resourceId}|${locale}`;
  const existing = inFlight.get(flightKey);
  if (existing) return existing;

  const p = loadOrMake(resourceId, locale)
    .catch((err) => {
      failedAt.set(resourceId, Date.now());
      console.warn(`[posters] no poster for video '${resourceId}':`, err instanceof Error ? err.message : err);
      return null;
    })
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, p);
  return p;
}

/** Starts posters for every listed video in the background, so the images are ready by the time tiles ask for them. */
export function warmPosters(resourceIds: string[], locale: string): void {
  for (const id of resourceIds) void getPoster(id, locale);
}

export function knownDurationSec(resourceId: string): number | null {
  return durations.get(resourceId) ?? null;
}

export function posterSupported(): boolean {
  return Boolean(deps.ffmpegPath);
}

export function __setPosterDepsForTests(overrides: Partial<PosterDeps> | null): void {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps;
  memory.clear();
  durations.clear();
  inFlight.clear();
  failedAt.clear();
  queue = Promise.resolve();
}
