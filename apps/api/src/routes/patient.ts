import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreatePatientCommand, UpdatePatientCommand, DeletePatientCommand } from "../commands/patient.js";
import { GetPatientListQuery, GetPatientByIdQuery } from "../queries/patient.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams, toFilterArray } from "./utils.js";

/**
 * Patient routes — thin waiters.
 *
 * Each handler does exactly three things:
 *   1. Parse input from req (no validation logic here — commands validate)
 *   2. Build TenantContext inside withTenant() and call a Command or Query
 *   3. Return the result
 *
 * No SQL, no business logic, no audit writes here.
 */

export const patientRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/patient — list patients
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetPatientListQuery(ctx, {
        search:    search || undefined,
        status:    toFilterArray(req.query.status)?.[0],
        region:    toFilterArray(req.query.region)?.[0],
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
// GET /api/v1/patient/:id — single patient
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const patient = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetPatientByIdQuery(ctx, id);
    });

    if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
    res.json(patient);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/patient — create patient
// ---------------------------------------------------------------------------
patientRouter.post(
  "/patient",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      salutation?: string; first_name?: string; last_name?: string;
      email?: string; phone?: string;
      practitioner_id?: string;
      hcp_id?: string; // legacy alias
      status?: string; region?: string;
      ahi_baseline?: number; cpap_device?: string; medical_record?: string;
      diagnosis_code?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      lead_id?: string;
    };

    const patient = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return CreatePatientCommand(ctx, {
        salutation:      typeof body.salutation      === "string" ? body.salutation.trim() || undefined : undefined,
        first_name:      typeof body.first_name      === "string" ? body.first_name.trim()  : "",
        last_name:       typeof body.last_name       === "string" ? body.last_name.trim()   : "",
        email:           typeof body.email           === "string" ? body.email.trim()        : undefined,
        phone:           typeof body.phone           === "string" ? body.phone.trim() || undefined : undefined,
        practitioner_id: typeof body.practitioner_id === "string" ? body.practitioner_id.trim() || undefined : undefined,
        hcp_id:          typeof body.hcp_id          === "string" ? body.hcp_id.trim() || undefined : undefined,
        status:          typeof body.status          === "string" ? body.status              : undefined,
        region:          typeof body.region          === "string" ? body.region              : undefined,
        ahi_baseline:    typeof body.ahi_baseline    === "number" ? body.ahi_baseline        : undefined,
        cpap_device:     typeof body.cpap_device     === "string" ? body.cpap_device.trim() || undefined : undefined,
        medical_record:  typeof body.medical_record  === "string" ? body.medical_record.trim() || undefined : undefined,
        diagnosis_code:  body.diagnosis_code,
        metadata:        body.metadata,
        lead_id:         typeof body.lead_id         === "string" ? body.lead_id.trim() || null : null,
      });
    });

    res.status(201).json(patient);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/patient/:id — update patient
// ---------------------------------------------------------------------------
patientRouter.patch(
  "/patient/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      salutation?: string; first_name?: string; last_name?: string;
      email?: string; phone?: string;
      practitioner_id?: string; hcp_id?: string;
      status?: string; region?: string;
      ahi_baseline?: number; cpap_device?: string; medical_record?: string;
      diagnosis_code?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };

    const patient = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return UpdatePatientCommand(ctx, id, {
        salutation:      body.salutation      !== undefined ? (body.salutation || undefined)   : undefined,
        first_name:      typeof body.first_name === "string" ? body.first_name.trim() || undefined : undefined,
        last_name:       typeof body.last_name  === "string" ? body.last_name.trim()  || undefined : undefined,
        email:           body.email            !== undefined ? body.email              : undefined,
        phone:           body.phone            !== undefined ? body.phone              : undefined,
        practitioner_id: body.practitioner_id  !== undefined ? body.practitioner_id   : undefined,
        hcp_id:          body.hcp_id           !== undefined ? body.hcp_id            : undefined,
        status:          typeof body.status    === "string"  ? body.status            : undefined,
        region:          typeof body.region    === "string"  ? body.region            : undefined,
        ahi_baseline:    typeof body.ahi_baseline === "number" ? body.ahi_baseline    : undefined,
        cpap_device:     body.cpap_device      !== undefined ? body.cpap_device       : undefined,
        medical_record:  body.medical_record   !== undefined ? body.medical_record    : undefined,
        diagnosis_code:  body.diagnosis_code,
        metadata:        body.metadata,
      });
    });

    if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
    res.json(patient);
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/patient/:id — soft delete
// ---------------------------------------------------------------------------
patientRouter.delete(
  "/patient/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      await DeletePatientCommand(ctx, id);
    });

    res.json({ success: true });
  })
);
