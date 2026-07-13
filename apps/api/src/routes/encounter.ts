import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateEncounterCommand, UpdateEncounterCommand } from "../commands/encounter.js";
import {
  GetEncounterListQuery,
  GetEncounterByIdQuery,
} from "../queries/encounter.js";
import { ValidationError } from "../errors.js";

/**
 * Encounter routes — thin waiters.
 *
 * Each handler does exactly three things:
 *   1. Parse input from req (no validation logic here — commands validate)
 *   2. Build TenantContext inside withTenant() and call a Command or Query
 *   3. Return the result
 *
 * No SQL, no business logic, no audit writes here.
 * The cook (command/query) does all of that.
 */

export const encounterRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/encounter — list encounters
// ---------------------------------------------------------------------------
encounterRouter.get(
  "/encounter",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetEncounterListQuery(ctx, {
        start:        typeof req.query.start       === "string" ? req.query.start.trim()       : undefined,
        end:          typeof req.query.end         === "string" ? req.query.end.trim()         : undefined,
        region:       typeof req.query.region      === "string" ? req.query.region.trim()      : undefined,
        territory_id: typeof req.query.territory_id === "string" ? req.query.territory_id.trim() : undefined,
        status:       typeof req.query.status      === "string" ? req.query.status.trim()      : undefined,
        userId:       typeof req.query.user_id     === "string" ? req.query.user_id.trim()     : undefined,
      });
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/encounter/:id — single encounter
// ---------------------------------------------------------------------------
encounterRouter.get(
  "/encounter/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing encounter id");

    const slug = tenantSlugFromHost(req.hostname);
    const encounter = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetEncounterByIdQuery(ctx, id);
    });

    if (!encounter) { res.status(404).json({ error: "Encounter not found" }); return; }
    res.json(encounter);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/encounter — create encounter
// ---------------------------------------------------------------------------
encounterRouter.post(
  "/encounter",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as Record<string, unknown>;

    const encounter = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return CreateEncounterCommand(ctx, {
        start_at:          typeof body.start_at          === "string" ? body.start_at.trim()          : "",
        end_at:            typeof body.end_at            === "string" ? body.end_at.trim()             : null,
        type:              typeof body.type              === "string" ? body.type.trim()               : "visit",
        status:            typeof body.status            === "string" ? body.status.trim()             : undefined,
        notes:             typeof body.notes             === "string" ? body.notes.trim()              : null,
        practitioner_id:   typeof body.practitioner_id  === "string" ? body.practitioner_id.trim()    : null,
        organization_id:   typeof body.organization_id  === "string" ? body.organization_id.trim()    : null,
        region:            typeof body.region            === "string" ? body.region.trim()             : null,
        territory_id:      typeof body.territory_id     === "string" ? body.territory_id.trim()       : null,
        attendees:         Array.isArray(body.attendees) ? body.attendees as string[]                 : [],
        transfer_of_value: body.transfer_of_value && typeof body.transfer_of_value === "object"
                             ? body.transfer_of_value as Record<string, unknown> : {},
        metadata:          body.metadata && typeof body.metadata === "object"
                             ? body.metadata as Record<string, unknown> : null,
      });
    });

    res.status(201).json(encounter);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/encounter/:id — update encounter
// ---------------------------------------------------------------------------
encounterRouter.patch(
  "/encounter/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing encounter id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as Record<string, unknown>;

    const encounter = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return UpdateEncounterCommand(ctx, id, {
        start_at:          body.start_at          !== undefined ? String(body.start_at).trim()         : undefined,
        end_at:            body.end_at            !== undefined ? (body.end_at ? String(body.end_at) : null) : undefined,
        type:              body.type              !== undefined ? String(body.type).trim()              : undefined,
        status:            body.status            !== undefined ? String(body.status).trim()            : undefined,
        notes:             body.notes             !== undefined ? (body.notes ? String(body.notes) : null) : undefined,
        practitioner_id:   body.practitioner_id   !== undefined ? (body.practitioner_id ? String(body.practitioner_id) : null) : undefined,
        organization_id:   body.organization_id   !== undefined ? (body.organization_id ? String(body.organization_id) : null) : undefined,
        region:            body.region            !== undefined ? String(body.region).trim()            : undefined,
        territory_id:      body.territory_id      !== undefined ? (body.territory_id ? String(body.territory_id) : null) : undefined,
        attendees:         Array.isArray(body.attendees) ? body.attendees as string[] : undefined,
        transfer_of_value: body.transfer_of_value && typeof body.transfer_of_value === "object"
                             ? body.transfer_of_value as Record<string, unknown> : undefined,
        disclosed_at:      body.disclosed_at      !== undefined ? (body.disclosed_at ? String(body.disclosed_at) : null) : undefined,
        metadata:          body.metadata          !== undefined ? (body.metadata ? body.metadata as Record<string, unknown> : null) : undefined,
      });
    });

    if (!encounter) { res.status(404).json({ error: "Encounter not found" }); return; }
    res.json(encounter);
  })
);
