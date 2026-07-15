import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateLeadCommand, UpdateLeadCommand, ConvertLeadCommand } from "../commands/lead.js";
import { GetLeadListQuery, GetLeadByIdQuery } from "../queries/lead.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams, toFilterArray } from "./utils.js";

/**
 * Lead routes — thin waiters.
 *
 * Each handler does exactly three things:
 *   1. Parse input from req (no validation logic here — commands validate)
 *   2. Build TenantContext inside withTenant() and call a Command or Query
 *   3. Return the result
 *
 * No SQL, no business logic, no audit writes here.
 */

export const leadsRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/lead — list leads
// ---------------------------------------------------------------------------
leadsRouter.get(
  "/lead",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetLeadListQuery(ctx, {
        search:    search || undefined,
        status:    toFilterArray(req.query.status),
        region:    toFilterArray(req.query.region),
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
// GET /api/v1/lead/:id — single lead
// ---------------------------------------------------------------------------
leadsRouter.get(
  "/lead/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing lead id");

    const slug = tenantSlugFromHost(req.hostname);
    const lead = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetLeadByIdQuery(ctx, id);
    });

    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    res.json(lead);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/lead — create lead
// ---------------------------------------------------------------------------
leadsRouter.post(
  "/lead",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      first_name?: string; last_name?: string;
      email?: string; phone?: string; status?: string;
      region?: string; source?: string; assigned_to?: string;
      metadata?: Record<string, unknown>;
    };

    const lead = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return CreateLeadCommand(ctx, {
        first_name:  typeof body.first_name === "string" ? body.first_name.trim() : "",
        last_name:   typeof body.last_name  === "string" ? body.last_name.trim()  : "",
        email:       typeof body.email       === "string" ? body.email.trim()       : null,
        phone:       typeof body.phone       === "string" ? body.phone.trim()       : null,
        status:      typeof body.status      === "string" ? body.status             : undefined,
        region:      typeof body.region      === "string" ? body.region             : undefined,
        source:      typeof body.source      === "string" ? body.source             : null,
        assigned_to: typeof body.assigned_to === "string" ? body.assigned_to.trim() : null,
        metadata:    body.metadata ?? null,
      });
    });

    res.status(201).json(lead);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/lead/:id — update lead
// ---------------------------------------------------------------------------
leadsRouter.patch(
  "/lead/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing lead id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      first_name?: string; last_name?: string;
      email?: string; phone?: string; status?: string;
      region?: string; source?: string; assigned_to?: string;
      metadata?: Record<string, unknown>;
      converted_to_id?: string; converted_to_type?: string;
    };

    // Conversion is a distinct write (status + converted_to_id/type/at, all
    // atomic) — route to ConvertLeadCommand instead of a generic field update
    // whenever the body carries both conversion fields.
    if (typeof body.converted_to_id === "string" && typeof body.converted_to_type === "string") {
      const lead = await withTenant(slug, async (client) => {
        const ctx = buildContext(req, client, slug);
        return ConvertLeadCommand(ctx, id, {
          converted_to_id:   body.converted_to_id!,
          converted_to_type: body.converted_to_type!,
        });
      });

      if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
      res.json(lead);
      return;
    }

    const lead = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return UpdateLeadCommand(ctx, id, {
        first_name:  typeof body.first_name === "string" ? body.first_name : undefined,
        last_name:   typeof body.last_name  === "string" ? body.last_name  : undefined,
        email:       body.email       !== undefined ? body.email       : undefined,
        phone:       body.phone       !== undefined ? body.phone       : undefined,
        status:      typeof body.status      === "string" ? body.status  : undefined,
        region:      typeof body.region      === "string" ? body.region  : undefined,
        source:      typeof body.source      === "string" ? body.source  : undefined,
        assigned_to: typeof body.assigned_to === "string" ? body.assigned_to : undefined,
        metadata:    body.metadata !== undefined ? body.metadata : undefined,
      });
    });

    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    res.json(lead);
  })
);
