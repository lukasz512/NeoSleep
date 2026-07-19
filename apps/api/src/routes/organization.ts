import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateOrganizationCommand, UpdateOrganizationCommand } from "../commands/organization.js";
import { GetOrganizationListQuery, GetOrganizationByIdQuery } from "../queries/organization.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams } from "./utils.js";

/**
 * Organization routes — thin waiters.
 *
 * Each handler does exactly three things:
 *   1. Parse input from req (no validation logic here — commands validate)
 *   2. Build TenantContext inside withTenant() and call a Command or Query
 *   3. Return the result
 *
 * No SQL, no business logic, no audit writes here.
 */

export const organizationRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/organization — list organizations
// ---------------------------------------------------------------------------
organizationRouter.get(
  "/organization",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetOrganizationListQuery(ctx, {
        search: search || undefined,
        type:   typeof req.query.type   === "string" ? req.query.type.trim()   || undefined : undefined,
        region: typeof req.query.region === "string" ? req.query.region.trim() || undefined : undefined,
        status: typeof req.query.status === "string" ? req.query.status.trim() || undefined : undefined,
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
// GET /api/v1/organization/:id — single organization
// ---------------------------------------------------------------------------
organizationRouter.get(
  "/organization/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing organization id");

    const slug = tenantSlugFromHost(req.hostname);
    const organization = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetOrganizationByIdQuery(ctx, id);
    });

    if (!organization) { res.status(404).json({ error: "Organization not found" }); return; }
    res.json(organization);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/organization — create organization
// ---------------------------------------------------------------------------
organizationRouter.post(
  "/organization",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      name?: string; type?: string; status?: string;
      address_line1?: string; city?: string; state?: string; postal_code?: string;
      country_code?: string; region?: string; phone?: string; email?: string; website?: string;
      google_link?: string; specialties?: string[];
      metadata?: Record<string, unknown>;
    };

    const organization = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return CreateOrganizationCommand(ctx, {
        name:          typeof body.name          === "string" ? body.name          : "",
        type:          typeof body.type          === "string" ? body.type          : undefined,
        status:        typeof body.status        === "string" ? body.status        : undefined,
        address_line1: typeof body.address_line1 === "string" ? body.address_line1 : null,
        city:          typeof body.city          === "string" ? body.city          : null,
        state:         typeof body.state         === "string" ? body.state         : null,
        postal_code:   typeof body.postal_code   === "string" ? body.postal_code   : null,
        country_code:  typeof body.country_code  === "string" ? body.country_code  : null,
        region:        typeof body.region        === "string" ? body.region        : undefined,
        phone:         typeof body.phone         === "string" ? body.phone         : null,
        email:         typeof body.email         === "string" ? body.email         : null,
        website:       typeof body.website       === "string" ? body.website       : null,
        google_link:   typeof body.google_link   === "string" ? body.google_link   : null,
        specialties:   Array.isArray(body.specialties) ? body.specialties : undefined,
        metadata:      body.metadata ?? null,
      });
    });

    res.status(201).json(organization);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/organization/:id — update organization
// ---------------------------------------------------------------------------
organizationRouter.patch(
  "/organization/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing organization id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      name?: string; type?: string; status?: string;
      address_line1?: string; city?: string; state?: string; postal_code?: string;
      country_code?: string; region?: string; phone?: string; email?: string; website?: string;
      google_link?: string; specialties?: string[];
      metadata?: Record<string, unknown>;
    };

    const organization = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return UpdateOrganizationCommand(ctx, id, {
        name:          typeof body.name          === "string" ? body.name          : undefined,
        type:          typeof body.type          === "string" ? body.type          : undefined,
        status:        typeof body.status        === "string" ? body.status        : undefined,
        address_line1: body.address_line1        !== undefined ? body.address_line1 : undefined,
        city:          body.city                 !== undefined ? body.city          : undefined,
        state:         body.state                !== undefined ? body.state         : undefined,
        postal_code:   body.postal_code          !== undefined ? body.postal_code   : undefined,
        country_code:  body.country_code         !== undefined ? body.country_code  : undefined,
        region:        typeof body.region        === "string" ? body.region        : undefined,
        phone:         body.phone                !== undefined ? body.phone         : undefined,
        email:         body.email                !== undefined ? body.email        : undefined,
        website:       body.website              !== undefined ? body.website      : undefined,
        google_link:   body.google_link          !== undefined ? body.google_link  : undefined,
        specialties:   Array.isArray(body.specialties) ? body.specialties : undefined,
        metadata:      body.metadata             !== undefined ? body.metadata     : undefined,
      });
    });

    if (!organization) { res.status(404).json({ error: "Organization not found" }); return; }
    res.json(organization);
  })
);
