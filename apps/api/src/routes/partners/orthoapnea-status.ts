import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { checkConnection } from "../../services/partners/orthoapnea.js";

/**
 * Connection status for the shared OrthoApnea account — polled by the
 * frontend on navigation into any OrthoApnea-dependent view (see
 * usePartnerConnection.ts) to retry a failed connection and surface a
 * notification, without gating navigation on it. Any future partner with
 * the same "one shared login, reconnect on demand" shape should expose the
 * same `GET /api/v1/partners/<partner>/status` route.
 */
export const orthoapneaStatusRouter: RouterType = Router();

orthoapneaStatusRouter.get(
  "/partners/orthoapnea/status",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await checkConnection());
  })
);
