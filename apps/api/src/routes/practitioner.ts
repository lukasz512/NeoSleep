import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreatePractitionerCommand, UpdatePractitionerCommand, DeletePractitionerCommand, ActivatePractitionerCommand } from "../commands/practitioner.js";
import { GetPractitionerListQuery, GetPractitionerByIdQuery } from "../queries/practitioner.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams, toFilterArray } from "./utils.js";

/**
 * Practitioner routes — thin waiters.
 *
 * Each handler does exactly three things:
 *   1. Parse input from req (no validation logic here — commands validate)
 *   2. Build TenantContext inside withTenant() and call a Command or Query
 *   3. Return the result
 *
 * No SQL, no business logic, no audit writes here.
 */

export const practitionerRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/practitioner — list practitioners
// ---------------------------------------------------------------------------
practitionerRouter.get(
  "/practitioner",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetPractitionerListQuery(ctx, {
        search:      search || undefined,
        specialty:   toFilterArray(req.query.specialty),
        institution: toFilterArray(req.query.institution),
        region:      toFilterArray(req.query.region),
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
// GET /api/v1/practitioner/:id — single practitioner
// ---------------------------------------------------------------------------
practitionerRouter.get(
  "/practitioner/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing practitioner id");

    const slug = tenantSlugFromHost(req.hostname);
    const practitioner = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetPractitionerByIdQuery(ctx, id);
    });

    if (!practitioner) { res.status(404).json({ error: "Practitioner not found" }); return; }
    res.json(practitioner);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/practitioner — create practitioner
// ---------------------------------------------------------------------------
practitionerRouter.post(
  "/practitioner",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      first_name?: string; last_name?: string; salutation?: string;
      email?: string; phone?: string; primary_specialty?: string;
      specialty?: string; // legacy alias
      organization_id?: string;
      institution?: string; region?: string;
      influence_tier?: string; language?: string;
      national_ids?: Record<string, string>;
      social_links?: Record<string, unknown>;
      lead_id?: string;
    };

    const practitioner = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CreatePractitionerCommand(ctx, {
        first_name:        typeof body.first_name === "string" ? body.first_name.trim() : "",
        last_name:         typeof body.last_name  === "string" ? body.last_name.trim()  : "",
        salutation:        typeof body.salutation        === "string" ? body.salutation               : null,
        email:             typeof body.email             === "string" ? body.email.trim()             : null,
        phone:             typeof body.phone             === "string" ? body.phone.trim()             : null,
        primary_specialty: typeof body.primary_specialty === "string" ? body.primary_specialty        : null,
        specialty:         typeof body.specialty         === "string" ? body.specialty                : null,
        organization_id:   typeof body.organization_id    === "string" ? body.organization_id          : undefined,
        institution:       typeof body.institution       === "string" ? body.institution              : null,
        region:            typeof body.region            === "string" ? body.region                   : undefined,
        influence_tier:    typeof body.influence_tier    === "string" ? body.influence_tier           : undefined,
        language:          typeof body.language          === "string" ? body.language                 : null,
        national_ids:      body.national_ids ?? null,
        social_links:      body.social_links ?? null,
        lead_id:           typeof body.lead_id           === "string" ? body.lead_id.trim()           : null,
      });
    });

    res.status(201).json(practitioner);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/practitioner/:id — update practitioner
// ---------------------------------------------------------------------------
practitionerRouter.patch(
  "/practitioner/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing practitioner id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      first_name?: string; last_name?: string; salutation?: string;
      email?: string; phone?: string; primary_specialty?: string;
      specialty?: string; // legacy alias
      organization_id?: string;
      institution?: string; region?: string;
      influence_tier?: string; language?: string;
      national_ids?: Record<string, string>;
      social_links?: Record<string, unknown>;
    };

    const practitioner = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return UpdatePractitionerCommand(ctx, id, {
        first_name:        typeof body.first_name === "string" ? body.first_name.trim() : undefined,
        last_name:         typeof body.last_name  === "string" ? body.last_name.trim()  : undefined,
        salutation:        typeof body.salutation        === "string" ? body.salutation        : undefined,
        email:             typeof body.email             === "string" ? body.email             : undefined,
        phone:             typeof body.phone             === "string" ? body.phone             : undefined,
        primary_specialty: typeof body.primary_specialty === "string" ? body.primary_specialty : undefined,
        specialty:         typeof body.specialty         === "string" ? body.specialty         : undefined,
        organization_id:   typeof body.organization_id    === "string" ? body.organization_id   : undefined,
        institution:       typeof body.institution       === "string" ? body.institution       : undefined,
        region:            typeof body.region            === "string" ? body.region            : undefined,
        influence_tier:    typeof body.influence_tier    === "string" ? body.influence_tier    : undefined,
        language:          typeof body.language          === "string" ? body.language          : undefined,
        national_ids:      body.national_ids !== undefined ? body.national_ids : undefined,
        social_links:      body.social_links !== undefined ? body.social_links : undefined,
      });
    });

    if (!practitioner) { res.status(404).json({ error: "Practitioner not found" }); return; }
    res.json(practitioner);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/practitioner/:id/activate — "training/capacitation finished":
// pending_approval -> active, provisions the linked doctor-role user account
// ---------------------------------------------------------------------------
practitionerRouter.post(
  "/practitioner/:id/activate",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing practitioner id");

    const slug = tenantSlugFromHost(req.hostname);
    const practitioner = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return ActivatePractitionerCommand(ctx, id);
    });

    if (!practitioner) { res.status(404).json({ error: "Practitioner not found" }); return; }
    res.json(practitioner);
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/practitioner/:id — soft delete (admin-only, matches frontend gating)
// ---------------------------------------------------------------------------
practitionerRouter.delete(
  "/practitioner/:id",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing practitioner id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await DeletePractitionerCommand(ctx, id);
    });

    res.json({ success: true });
  })
);
