import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreatePresentationCommand, UpdatePresentationCommand } from "../commands/presentation.js";
import { GetPresentationListQuery, GetPresentationByIdQuery } from "../queries/presentation.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams } from "./utils.js";

/**
 * Presentation routes — thin waiters.
 *
 * Each handler does exactly three things:
 *   1. Parse input from req (no validation logic here — commands validate)
 *   2. Build TenantContext inside withTenant() and call a Command or Query
 *   3. Return the result
 *
 * No SQL, no business logic, no audit writes here.
 *
 * NOTE: mounted singular (/api/v1/presentation), matching every other
 * entity's convention (lead/practitioner/organization/patient). This file
 * replaces the old routes/presentations.ts (plural) and presentationsRouter —
 * the tenant-resolution bug that lived in db/presentation.ts (hardcoded
 * withTenant(tenantSlugFromHost(""))) is fixed by resolving the slug from the
 * actual request HERE, exactly like organization.ts/patient.ts do.
 */
export const presentationRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/presentation — list presentations
// ---------------------------------------------------------------------------
presentationRouter.get(
  "/presentation",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetPresentationListQuery(ctx, {
        search: search || undefined,
        status: typeof req.query.status === "string" ? req.query.status.trim() || undefined : undefined,
        locale: typeof req.query.locale === "string" ? req.query.locale.trim() || undefined : undefined,
        page,
        limit,
        sortBy,
        sortOrder,
      });
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/presentation/:id — single presentation
// ---------------------------------------------------------------------------
presentationRouter.get(
  "/presentation/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing presentation id");

    const slug = tenantSlugFromHost(req.hostname);
    const presentation = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetPresentationByIdQuery(ctx, id);
    });

    if (!presentation) { res.status(404).json({ error: "Presentation not found" }); return; }
    res.json(presentation);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/presentation — create presentation
// ---------------------------------------------------------------------------
presentationRouter.post(
  "/presentation",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      title?: string; file_url?: string; thumbnail_url?: string; locale?: string;
      keywords?: unknown; tags?: unknown; status?: string;
      metadata?: Record<string, unknown>;
    };

    const presentation = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return CreatePresentationCommand(ctx, {
        title:         typeof body.title === "string" ? body.title : "",
        file_url:      typeof body.file_url === "string" ? body.file_url : "",
        thumbnail_url: typeof body.thumbnail_url === "string" ? body.thumbnail_url : null,
        locale:        typeof body.locale === "string" ? body.locale : undefined,
        keywords:      Array.isArray(body.keywords) ? body.keywords.filter((v): v is string => typeof v === "string") : undefined,
        tags:          Array.isArray(body.tags) ? body.tags.filter((v): v is string => typeof v === "string") : undefined,
        status:        typeof body.status === "string" ? body.status : undefined,
        metadata:      body.metadata ?? null,
      });
    });

    res.status(201).json(presentation);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/presentation/:id — update presentation
// ---------------------------------------------------------------------------
presentationRouter.patch(
  "/presentation/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing presentation id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      title?: string; file_url?: string; thumbnail_url?: string; locale?: string;
      keywords?: unknown; tags?: unknown; status?: string;
      metadata?: Record<string, unknown>;
    };

    const presentation = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return UpdatePresentationCommand(ctx, id, {
        title:         typeof body.title === "string" ? body.title : undefined,
        file_url:      typeof body.file_url === "string" ? body.file_url : undefined,
        thumbnail_url: body.thumbnail_url !== undefined ? body.thumbnail_url : undefined,
        locale:        typeof body.locale === "string" ? body.locale : undefined,
        keywords:      Array.isArray(body.keywords) ? body.keywords.filter((v): v is string => typeof v === "string") : undefined,
        tags:          Array.isArray(body.tags) ? body.tags.filter((v): v is string => typeof v === "string") : undefined,
        status:        typeof body.status === "string" ? body.status : undefined,
        metadata:      body.metadata !== undefined ? body.metadata : undefined,
      });
    });

    if (!presentation) { res.status(404).json({ error: "Presentation not found" }); return; }
    res.json(presentation);
  })
);
