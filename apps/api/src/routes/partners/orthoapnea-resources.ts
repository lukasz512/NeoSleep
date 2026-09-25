import { Readable } from "node:stream";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth, requirePartnerMediaAuth } from "../../middleware/requireAuth.js";
import { signMediaToken } from "../../utils/jwt.js";
import { fetchResources, fetchResourceMedia } from "../../services/partners/orthoapnea.js";
import { ValidationError } from "../../errors.js";
import { routeParam } from "../utils.js";

/**
 * OrthoApnea resources (documents/videos library) — read-only, no queueing
 * needed here (unlike order submission, not yet built — see
 * services/partners/orthoapnea.ts header comment). Safe to call concurrently
 * from many reps at once.
 */
export const orthoapneaResourcesRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/resources — list, locale-mapped
// ---------------------------------------------------------------------------
orthoapneaResourcesRouter.get(
  "/partners/orthoapnea/resources",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const locale = (req.query.locale as string | undefined) ?? "en";
    const resources = await fetchResources(locale);
    // For the `?t=` on each mediaUrl — see signMediaToken for why.
    res.json({ resources, mediaToken: signMediaToken(req.user!.sub) });
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
    // Player seeks/pauses abort their request; destroying our stream cancels
    // the upstream body too, so apneadock.es doesn't keep sending hundreds
    // of MB nobody will read.
    const stream = Readable.fromWeb(media.body as import("node:stream/web").ReadableStream<Uint8Array>);
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  })
);
