import { Router, type Request, type Response } from "express";
import { getAppConfig, updateAppConfig, type AppConfigUpdate } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const configRouter = Router();

/** GET /api/config/app – app theme/branding (public, used by website and rep-app). */
configRouter.get(
  "/api/config/app",
  asyncHandler(async (_req: Request, res: Response) => {
    const config = await getAppConfig();
    res.json(config);
  })
);

/** PATCH /api/config/app – update theme (admin only). In dev, allow when no API session (e.g. "Go to app" login). */
configRouter.patch(
  "/api/config/app",
  asyncHandler(async (req: Request, res: Response) => {
    const session = req.session as { user?: { role?: string } } | undefined;
    const isAdmin = session?.user?.role === "admin";
    if (!isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const updates: AppConfigUpdate = {};
    const normHex = (s: unknown) =>
      typeof s === "string" && s.trim() ? s.trim().toLowerCase() : "";
    if (normHex(body.primary_color)) {
      updates.primary_color = normHex(body.primary_color);
    }
    if (normHex(body.secondary_color)) {
      updates.secondary_color = normHex(body.secondary_color);
    }
    if (normHex(body.primary_color_dark)) {
      updates.primary_color_dark = normHex(body.primary_color_dark);
    }
    if (normHex(body.secondary_color_dark)) {
      updates.secondary_color_dark = normHex(body.secondary_color_dark);
    }
    if (typeof body.border_radius === "string" && body.border_radius.trim()) {
      updates.border_radius = body.border_radius.trim();
    }
    if (body.logo_url !== undefined) {
      updates.logo_url = typeof body.logo_url === "string" ? body.logo_url.trim() || null : null;
    }
    if (normHex(body.surface_color)) {
      updates.surface_color = normHex(body.surface_color);
    }
    if (body.hero_container_style === "wide" || body.hero_container_style === "compact") {
      updates.hero_container_style = body.hero_container_style;
    }
    if (body.color_scheme === "light" || body.color_scheme === "dark") {
      updates.color_scheme = body.color_scheme;
    }
    const config = await updateAppConfig(updates);
    res.json(config);
  })
);
