import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateTerritoryCommand, UpdateTerritoryCommand, DeleteTerritoryCommand } from "../commands/territory.js";
import { GetTerritoryListQuery, GetTerritoryByIdQuery, GetTerritoryPathQuery } from "../queries/territory.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams } from "./utils.js";

/**
 * Territory routes — the geographic hierarchy (country > region > city >
 * village > district) used for the patient address breadcrumb (see
 * PatientDetailView.vue's "Región" row) and rep/organization territory
 * assignment. Reads are requireAuth (the patient form's territory picker
 * needs the list); writes are admin-only — this is data-entry for a shared
 * reference tree, not per-record patient data.
 */

export const territoryRouter: RouterType = Router();

interface TerritoryBody {
  name?: unknown;
  code?: unknown;
  country_code?: unknown;
  parent_id?: unknown;
  kind?: unknown;
  metadata?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function strOrNull(v: unknown): string | null | undefined {
  if (v === null) return null;
  return typeof v === "string" ? v : undefined;
}
function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

// ---------------------------------------------------------------------------
// GET /api/v1/territory — list (filterable by search, country_code, kind, parent_id)
// ---------------------------------------------------------------------------
territoryRouter.get(
  "/territory",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit } = parsePaginationParams(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const countryCode = typeof req.query.country_code === "string" ? req.query.country_code.trim() : undefined;
    const kind = typeof req.query.kind === "string" ? req.query.kind.trim() : undefined;
    const parentId =
      req.query.parent_id === "null" ? null
      : typeof req.query.parent_id === "string" ? req.query.parent_id.trim()
      : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetTerritoryListQuery(ctx, {
        search: search || undefined,
        country_code: countryCode || undefined,
        kind: kind || undefined,
        parent_id: parentId,
        page,
        limit,
      });
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/territory/:id/path — root-first breadcrumb ancestor chain
// ---------------------------------------------------------------------------
territoryRouter.get(
  "/territory/:id/path",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing territory id");

    const slug = tenantSlugFromHost(req.hostname);
    const path = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetTerritoryPathQuery(ctx, id);
    });
    res.json({ path });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/territory/:id — single territory
// ---------------------------------------------------------------------------
territoryRouter.get(
  "/territory/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing territory id");

    const slug = tenantSlugFromHost(req.hostname);
    const territory = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetTerritoryByIdQuery(ctx, id);
    });

    if (!territory) { res.status(404).json({ error: "Territory not found" }); return; }
    res.json(territory);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/territory — create (admin-only)
// ---------------------------------------------------------------------------
territoryRouter.post(
  "/territory",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as TerritoryBody;
    const name = str(body.name);
    const countryCode = str(body.country_code);
    const kind = str(body.kind);
    if (!name) throw new ValidationError("name is required");
    if (!countryCode) throw new ValidationError("country_code is required");
    if (!kind) throw new ValidationError("kind is required");

    const slug = tenantSlugFromHost(req.hostname);
    const territory = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CreateTerritoryCommand(ctx, {
        name,
        code: strOrNull(body.code) ?? null,
        country_code: countryCode,
        parent_id: strOrNull(body.parent_id) ?? null,
        kind,
        metadata: obj(body.metadata) ?? null,
      });
    });

    res.status(201).json(territory);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/territory/:id — update (admin-only)
// ---------------------------------------------------------------------------
territoryRouter.patch(
  "/territory/:id",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing territory id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as TerritoryBody;
    const territory = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return UpdateTerritoryCommand(ctx, id, {
        name: str(body.name),
        code: strOrNull(body.code),
        country_code: str(body.country_code),
        parent_id: strOrNull(body.parent_id),
        kind: str(body.kind),
        metadata: obj(body.metadata),
      });
    });

    if (!territory) { res.status(404).json({ error: "Territory not found" }); return; }
    res.json(territory);
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/territory/:id — soft delete (admin-only)
// ---------------------------------------------------------------------------
territoryRouter.delete(
  "/territory/:id",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing territory id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await DeleteTerritoryCommand(ctx, id);
    });

    res.json({ success: true });
  })
);
