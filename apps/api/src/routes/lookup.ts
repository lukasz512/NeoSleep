import { Router, type Request, type Response } from "express";
import { withTenant, tenantSlugFromHost, getConfigOptions, upsertTenantLookupItem, disableTenantLookupItem } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ValidationError } from "../errors.js";

/**
 * Lookup routes — the proper replacement for the removed config_options system.
 *
 * API PATHS (clean, no legacy aliases):
 *   GET  /api/v1/lookups/options         — grouped options for filter dropdowns (public)
 *   GET  /api/v1/lookups/:type           — all items for a type (auth required)
 *   POST /api/v1/lookups                 — add custom item or override (admin/manager)
 *   DELETE /api/v1/lookups/disable/:id   — hide a platform item for this tenant (admin/manager)
 *
 * HOW TENANT CONTEXT FLOWS:
 *   1. tenantSlugFromHost() extracts the subdomain (e.g. "neosleep_pl" from app-uat.neosleepcare.com)
 *   2. withTenant() acquires a PoolClient and runs SET LOCAL search_path
 *   3. All lookup queries run on that scoped client — correct tenant schema guaranteed
 *
 * NOTE FOR FRONTEND:
 *   The old /api/v1/config/options path is gone. Update calls to /api/v1/lookups/options.
 */

export const lookupRouter: import("express").Router = Router();

function requireAdminOrManager(req: Request, res: Response): boolean {
  const session = req.session as { user?: { role?: string } } | undefined;
  const role = session?.user?.role;
  const isAllowed = role === "admin" || role === "manager";
  const devBypass = process.env.NODE_ENV !== "production" && !session?.user;
  if (!isAllowed && !devBypass) {
    res.status(403).json({ error: "Admin or manager only" });
    return false;
  }
  return true;
}

/**
 * GET /api/v1/lookups/options
 * Public — no auth required.
 * Returns the three option groups used by filter dropdowns:
 *   { specialties, organization_types, regions }
 */
lookupRouter.get(
  "/lookups/options",
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const locale = (req.query.locale as string | undefined) ?? "en";
    const options = await withTenant(slug, (client) => getConfigOptions(client, locale));
    res.json(options);
  })
);

/**
 * GET /api/v1/lookups/:type
 * Returns all effective items for a lookup type (tenant overrides applied).
 * Auth required. Use for dynamic dropdowns in admin UI.
 * Example: GET /api/v1/lookups/specialty?locale=pl
 */
lookupRouter.get(
  "/lookups/:type",
  asyncHandler(async (req: Request, res: Response) => {
    const session = req.session as { user?: { role?: string } } | undefined;
    if (!session?.user) { res.status(401).json({ error: "Authentication required" }); return; }

    const slug   = tenantSlugFromHost(req.hostname);
    const type   = req.params.type?.trim();
    const locale = (req.query.locale as string | undefined) ?? "en";

    if (!type) { res.status(400).json({ error: "type is required" }); return; }

    const { getTenantLookup } = await import("../db.js");
    const items = await withTenant(slug, (client) => getTenantLookup(client, type, locale));
    res.json(items);
  })
);

/**
 * POST /api/v1/lookups
 * Add a custom lookup item or override a platform item's label/sort_order.
 * Admin or manager only.
 *
 * Body: { type, key, value, locale?, sort_order?, global_id? }
 *   - global_id present → override a platform.lookups item (changes label/sort_order)
 *   - global_id absent  → create a tenant-only custom item
 */
lookupRouter.post(
  "/lookups",
  asyncHandler(async (req: Request, res: Response) => {
    if (!requireAdminOrManager(req, res)) return;

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      type?: unknown; key?: unknown; value?: unknown;
      locale?: unknown; sort_order?: unknown; global_id?: unknown;
    };

    const type       = typeof body.type       === "string" ? body.type.trim()       : "";
    const key        = typeof body.key        === "string" ? body.key.trim()        : "";
    const value      = typeof body.value      === "string" ? body.value.trim()      : "";
    const locale     = typeof body.locale     === "string" ? body.locale.trim()     : "en";
    const sort_order = typeof body.sort_order === "number" ? body.sort_order        : 0;
    const global_id  = typeof body.global_id  === "string" ? body.global_id        : null;

    if (!type)  throw new ValidationError("type is required");
    if (!key)   throw new ValidationError("key is required");
    if (!value) throw new ValidationError("value is required");

    const item = await withTenant(slug, (client) =>
      upsertTenantLookupItem(client, { type, key, value, locale, sort_order, global_id })
    );
    res.status(201).json(item);
  })
);

/**
 * DELETE /api/v1/lookups/disable/:globalId
 * Hides a non-locked platform lookup item for this tenant.
 * Locked items (locked=true in platform.lookups) cannot be hidden.
 * Admin or manager only.
 */
lookupRouter.delete(
  "/lookups/disable/:globalId",
  asyncHandler(async (req: Request, res: Response) => {
    if (!requireAdminOrManager(req, res)) return;

    const slug     = tenantSlugFromHost(req.hostname);
    const globalId = req.params.globalId?.trim();
    if (!globalId) { res.status(400).json({ error: "globalId is required" }); return; }

    const disabled = await withTenant(slug, (client) =>
      disableTenantLookupItem(client, globalId)
    );

    if (!disabled) {
      res.status(409).json({ error: "Item not found or is locked (cannot be hidden)" });
      return;
    }
    res.status(204).end();
  })
);
