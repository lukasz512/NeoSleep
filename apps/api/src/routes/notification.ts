import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { GetNotificationListQuery, GetUnreadNotificationCountQuery } from "../queries/notification.js";
import { MarkNotificationReadCommand, MarkAllNotificationsReadCommand } from "../commands/notification.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams } from "./utils.js";

/**
 * Notification Center routes (ADR-012) — thin waiters, see routes/leads.ts
 * header comment for the Command/Query pattern this follows.
 */

export const notificationRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/notification — list (filter=all|unread)
// ---------------------------------------------------------------------------
notificationRouter.get(
  "/notification",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit } = parsePaginationParams(req);
    const filter = req.query.filter === "unread" ? "unread" : "all";

    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetNotificationListQuery(ctx, { filter, page, limit });
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/notification/unread-count — badge count, polled by the bell
// ---------------------------------------------------------------------------
notificationRouter.get(
  "/notification/unread-count",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetUnreadNotificationCountQuery(ctx);
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/notification/:id/read — mark one read
// ---------------------------------------------------------------------------
notificationRouter.patch(
  "/notification/:id/read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing notification id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await MarkNotificationReadCommand(ctx, id);
    });

    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/notification/mark-all-read
// ---------------------------------------------------------------------------
notificationRouter.post(
  "/notification/mark-all-read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return MarkAllNotificationsReadCommand(ctx);
    });

    res.json(result);
  })
);
