import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireInternalJobSecret } from "../middleware/requireInternalJobSecret.js";
import { RunNotificationTickAllTenants } from "../commands/notificationTick.js";

/** Machine-to-machine job endpoints, called by GitHub Actions cron (INTERNAL_JOB_SECRET). */
export const internalJobsRouter: RouterType = Router();

// POST /api/v1/internal/jobs/notifications/tick: CORE-3, every 5 min by
// .github/workflows/notification-tick.yml.
internalJobsRouter.post(
  "/internal/jobs/notifications/tick",
  requireInternalJobSecret,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await RunNotificationTickAllTenants());
  })
);
