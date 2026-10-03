import { Readable } from "node:stream";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requirePartnerMediaAuth } from "../../middleware/requireAuth.js";
import { signMediaToken } from "../../utils/jwt.js";
import { fetchResources, fetchResourceMedia } from "../../services/partners/orthoapnea.js";
import { getPoster, warmPosters, knownDurationSec, posterSupported } from "../../services/partners/resourcePosters.js";
import { ValidationError } from "../../errors.js";
import { routeParam } from "../utils.js";
import { withTenant, tenantSlugFromHost } from "../../db.js";
import { buildContext } from "../../context/TenantContext.js";
import {
  listResourceProgress,
  getResourceProgressForUpdate,
  saveResourceProgress,
  type ResourceProgressRow,
} from "../../db/resourceProgress.js";
import { nextProgress, progressPercent, type ProgressState } from "../../services/partners/resourceProgress.js";

/**
 * OrthoApnea resources (documents/videos library) — read-only, no queueing
 * needed here (unlike order submission, not yet built — see
 * services/partners/orthoapnea.ts header comment). Safe to call concurrently
 * from many reps at once.
 */
export const orthoapneaResourcesRouter: RouterType = Router();

/** Cloud Run's cap on a response that declares its size (HTTP/1, non-streamed). */
const CLOUD_RUN_MAX_BUFFERED_BYTES = 32 * 1024 * 1024;

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/resources — list, locale-mapped
// ---------------------------------------------------------------------------
orthoapneaResourcesRouter.get(
  "/partners/orthoapnea/resources",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const locale = (req.query.locale as string | undefined) ?? "en";
    const withPosters = posterSupported();
    const resources = (await fetchResources(locale)).map((r) =>
      r.kind === "video"
        ? {
            ...r,
            posterUrl: withPosters ? `/api/v1/partners/orthoapnea/resources/${r.id}/poster?locale=${locale}` : null,
            durationSec: knownDurationSec(r.id),
          }
        : r
    );
    if (withPosters) warmPosters(resources.filter((r) => r.kind === "video").map((r) => r.id), locale);
    // For the `?t=` on each mediaUrl — see signMediaToken for why.
    res.json({ resources, mediaToken: signMediaToken(req.user!.sub) });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/resources/:id/poster — one JPEG frame (NEO-151)
// ---------------------------------------------------------------------------
orthoapneaResourcesRouter.get(
  "/partners/orthoapnea/resources/:id/poster",
  requirePartnerMediaAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = routeParam(req, "id")?.trim();
    if (!id) throw new ValidationError("Missing resource id");
    const locale = (req.query.locale as string | undefined) ?? "en";
    const poster = await getPoster(id, locale);
    // 404, not 5xx: a missing poster is expected (no ffmpeg on this host, odd file) and the tile has a fallback cover.
    if (!poster) {
      res.status(404).json({ error: "No poster for this video" });
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.end(Buffer.from(poster.jpeg));
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/resources/:id/media — streamed, never stored
// ---------------------------------------------------------------------------
orthoapneaResourcesRouter.get(
  "/partners/orthoapnea/resources/:id/media",
  requirePartnerMediaAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = routeParam(req, "id")?.trim();
    if (!id) throw new ValidationError("Missing resource id");
    const locale = (req.query.locale as string | undefined) ?? "en";
    const lang = req.query.lang as string | undefined;

    const media = await fetchResourceMedia(id, locale, lang, req.headers.range);
    res.status(media.status);
    // helmet's default CORP (same-origin) makes the browser refuse a
    // `<video>`/`<a>` on the PWA's own origin loading this from the API's.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    for (const [name, value] of Object.entries(media.headers)) {
      if (value) res.setHeader(name, value);
    }
    // Always advertise ranges so players switch to 206 slices, and never
    // declare a length Cloud Run would refuse (>32 MiB): without it, Node
    // streams chunked, which Cloud Run allows (a request with no Range at all).
    res.setHeader("Accept-Ranges", "bytes");
    if (Number(media.headers["content-length"]) > CLOUD_RUN_MAX_BUFFERED_BYTES) res.removeHeader("Content-Length");
    // Player seeks/pauses abort their request; destroying our stream cancels
    // the upstream body too, so apneadock.es doesn't keep sending hundreds
    // of MB nobody will read.
    const stream = Readable.fromWeb(media.body as import("node:stream/web").ReadableStream<Uint8Array>);
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  })
);

// ---------------------------------------------------------------------------
// Watch progress per user (NEO-209) — status per video + where to resume.
// Every role has its own; nobody reads another user's here (a manager team
// report is a separate, privacy-reviewed ticket).
// ---------------------------------------------------------------------------
const PARTNER = "orthoapnea";
const RESOURCE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Longest webinar is ~1 h; anything past a day is a client bug, not a video. */
const MAX_DURATION_SEC = 24 * 3600;

function resourceIdParam(req: Request): string {
  const id = routeParam(req, "id")?.trim() ?? "";
  if (!RESOURCE_ID.test(id)) throw new ValidationError("Invalid resource id", "id");
  return id;
}

function seconds(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_DURATION_SEC) {
    throw new ValidationError(`${field} must be a number of seconds`, field);
  }
  return value;
}

function toState(row: ResourceProgressRow | null): ProgressState {
  return row
    ? { status: row.status, source: row.status_source, positionSec: row.position_sec, maxPositionSec: row.max_position_sec, durationSec: row.duration_sec }
    : { status: "not_started", source: "watched", positionSec: 0, maxPositionSec: 0, durationSec: null };
}

function toDto(row: ResourceProgressRow) {
  return {
    resourceId: row.resource_id,
    status: row.status,
    source: row.status_source,
    positionSec: row.position_sec,
    durationSec: row.duration_sec,
    percent: progressPercent({ status: row.status, maxPositionSec: row.max_position_sec, durationSec: row.duration_sec }),
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/v1/partners/orthoapnea/resources/progress — the caller's own rows
orthoapneaResourcesRouter.get(
  "/partners/orthoapnea/resources/progress",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const rows = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return listResourceProgress(client, ctx.user.id, PARTNER);
    });
    res.json({ progress: rows.map(toDto) });
  })
);

// PUT /api/v1/partners/orthoapnea/resources/:id/progress — player report
orthoapneaResourcesRouter.put(
  "/partners/orthoapnea/resources/:id/progress",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = resourceIdParam(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const report = {
      positionSec: seconds(body.positionSec, "positionSec"),
      durationSec: seconds(body.durationSec, "durationSec"),
      ended: body.ended === true,
    };
    const slug = tenantSlugFromHost(req.hostname);
    const row = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const prev = await getResourceProgressForUpdate(client, ctx.user.id, PARTNER, id);
      return saveResourceProgress(client, ctx.user.id, PARTNER, id, nextProgress(toState(prev), report));
    });
    res.json(toDto(row));
  })
);

// PUT /api/v1/partners/orthoapnea/resources/:id/status — tile menu mark/unmark (D4)
orthoapneaResourcesRouter.put(
  "/partners/orthoapnea/resources/:id/status",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = resourceIdParam(req);
    const status = (req.body as Record<string, unknown> | undefined)?.status;
    if (status !== "completed" && status !== "not_started") {
      throw new ValidationError("status must be completed or not_started", "status");
    }
    const slug = tenantSlugFromHost(req.hostname);
    const row = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const prev = toState(await getResourceProgressForUpdate(client, ctx.user.id, PARTNER, id));
      const next: ProgressState =
        status === "completed"
          ? { ...prev, status, source: "marked" }
          : { ...prev, status, source: "marked", positionSec: 0, maxPositionSec: 0 };
      return saveResourceProgress(client, ctx.user.id, PARTNER, id, next);
    });
    res.json(toDto(row));
  })
);
