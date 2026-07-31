import { Readable } from "node:stream";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { fetchResources, fetchResourceMedia } from "../../services/partners/orthoapnea.js";
import { ValidationError } from "../../errors.js";

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
    res.json({ resources });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/resources/:id/media — streamed, never stored
// ---------------------------------------------------------------------------
orthoapneaResourcesRouter.get(
  "/partners/orthoapnea/resources/:id/media",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing resource id");
    const locale = (req.query.locale as string | undefined) ?? "en";

    const { body, contentType } = await fetchResourceMedia(id, locale);
    if (contentType) res.setHeader("Content-Type", contentType);
    Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(res);
  })
);
