import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreatePatientCommand, UpdatePatientCommand, DeletePatientCommand } from "../commands/patient.js";
import { GetPatientListQuery, GetPatientByIdQuery } from "../queries/patient.js";
import { GetHistoryForPatientQuery } from "../queries/auditLog.js";
import { GetPatientDocumentsQuery, GetPatientDocumentDownloadUrlQuery } from "../queries/entityDocuments.js";
import { SaveEndoIntakeCommand, GenerateEndoIntakePdfCommand } from "../commands/endoIntake.js";
import { GetEndoIntakeQuery } from "../queries/endoIntake.js";
import { RecordStopBangScreeningCommand, GenerateStopBangPdfCommand } from "../commands/stopBangScreening.js";
import { ListStopBangScreeningsQuery } from "../queries/stopBangScreening.js";
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
      const ctx = await buildContext(req, client, slug);
      return GetPatientListQuery(ctx, {
        search:    search || undefined,
        status:    toFilterArray(req.query.status)?.[0],
        region:    toFilterArray(req.query.region)?.[0],
        practitioner_id: typeof req.query.practitioner_id === "string" ? req.query.practitioner_id.trim() || undefined : undefined,
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
      const ctx = await buildContext(req, client, slug);
      return GetPatientByIdQuery(ctx, id);
    });

    if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
    res.json(patient);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/patient/:id/history — audit trail + lead origin (History tab)
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/history",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const history = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetHistoryForPatientQuery(ctx, id);
    });

    res.json(history);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/patient/:id/documents — Documents tab
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/documents",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const documents = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetPatientDocumentsQuery(ctx, id);
    });
    res.json(documents);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/patient/:id/documents/:documentId/download — short-lived signed URL
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/documents/:documentId/download",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    const documentId = req.params.documentId?.trim();
    if (!id || !documentId) throw new ValidationError("Missing patient id or document id");

    const slug = tenantSlugFromHost(req.hostname);
    const url = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetPatientDocumentDownloadUrlQuery(ctx, id, documentId);
    });
    res.json({ url });
  })
);

// ---------------------------------------------------------------------------
// GET/PUT /api/v1/patient/:id/endo-intake — Historia Endo checklist
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/endo-intake",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const intake = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetEndoIntakeQuery(ctx, id);
    });
    res.json(intake);
  })
);

patientRouter.put(
  "/patient/:id/endo-intake",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const intake = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return SaveEndoIntakeCommand(ctx, id, (req.body ?? {}) as Record<string, unknown>);
    });
    res.json(intake);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/patient/:id/endo-intake/generate-pdf
// ---------------------------------------------------------------------------
patientRouter.post(
  "/patient/:id/endo-intake/generate-pdf",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GenerateEndoIntakePdfCommand(ctx, id);
    });
    res.status(201).json(result);
  })
);

// ---------------------------------------------------------------------------
// GET/POST /api/v1/patient/:id/stop-bang — STOP-Bang screening (recurring)
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/stop-bang",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const screenings = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return ListStopBangScreeningsQuery(ctx, id);
    });
    res.json(screenings);
  })
);

patientRouter.post(
  "/patient/:id/stop-bang",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const screening = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return RecordStopBangScreeningCommand(ctx, id, (req.body ?? {}) as Record<string, unknown>);
    });
    res.status(201).json(screening);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/patient/:id/stop-bang/:screeningId/generate-pdf
// ---------------------------------------------------------------------------
patientRouter.post(
  "/patient/:id/stop-bang/:screeningId/generate-pdf",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    const screeningId = req.params.screeningId?.trim();
    if (!id || !screeningId) throw new ValidationError("Missing patient id or screening id");

    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GenerateStopBangPdfCommand(ctx, id, screeningId);
    });
    res.status(201).json(result);
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
      email?: string; phone?: string; date_of_birth?: string | null;
      practitioner_id?: string;
      hcp_id?: string; // legacy alias
      status?: string; region?: string; territory_id?: string | null;
      country_code?: string;
      ahi_baseline?: number; cpap_device?: string; medical_record?: string;
      diagnosis_code?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      lead_id?: string;
    };

    const patient = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CreatePatientCommand(ctx, {
        salutation:      typeof body.salutation      === "string" ? body.salutation.trim() || undefined : undefined,
        first_name:      typeof body.first_name      === "string" ? body.first_name.trim()  : "",
        last_name:       typeof body.last_name       === "string" ? body.last_name.trim()   : "",
        email:           typeof body.email           === "string" ? body.email.trim()        : undefined,
        phone:           typeof body.phone           === "string" ? body.phone.trim() || undefined : undefined,
        date_of_birth:   typeof body.date_of_birth   === "string" ? body.date_of_birth : undefined,
        practitioner_id: typeof body.practitioner_id === "string" ? body.practitioner_id.trim() || undefined : undefined,
        hcp_id:          typeof body.hcp_id          === "string" ? body.hcp_id.trim() || undefined : undefined,
        status:          typeof body.status          === "string" ? body.status              : undefined,
        region:          typeof body.region          === "string" ? body.region              : undefined,
        territory_id:    body.territory_id === null ? null : typeof body.territory_id === "string" ? body.territory_id || null : undefined,
        country_code:    typeof body.country_code    === "string" ? body.country_code.trim() || null : undefined,
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
      email?: string; phone?: string; date_of_birth?: string | null;
      practitioner_id?: string; hcp_id?: string;
      status?: string; region?: string; territory_id?: string | null;
      country_code?: string | null;
      ahi_baseline?: number; cpap_device?: string; medical_record?: string;
      diagnosis_code?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };

    const patient = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return UpdatePatientCommand(ctx, id, {
        salutation:      body.salutation      !== undefined ? (body.salutation || undefined)   : undefined,
        first_name:      typeof body.first_name === "string" ? body.first_name.trim() || undefined : undefined,
        last_name:       typeof body.last_name  === "string" ? body.last_name.trim()  || undefined : undefined,
        email:           body.email            !== undefined ? body.email              : undefined,
        phone:           body.phone            !== undefined ? body.phone              : undefined,
        date_of_birth:   body.date_of_birth === null ? null : typeof body.date_of_birth === "string" ? body.date_of_birth : undefined,
        practitioner_id: body.practitioner_id  !== undefined ? body.practitioner_id   : undefined,
        hcp_id:          body.hcp_id           !== undefined ? body.hcp_id            : undefined,
        status:          typeof body.status    === "string"  ? body.status            : undefined,
        region:          typeof body.region    === "string"  ? body.region            : undefined,
        territory_id:    body.territory_id === null ? null : typeof body.territory_id === "string" ? body.territory_id || null : undefined,
        country_code:    body.country_code     !== undefined ? body.country_code      : undefined,
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
// DELETE /api/v1/patient/:id — soft delete (admin-only, matches frontend gating)
// ---------------------------------------------------------------------------
patientRouter.delete(
  "/patient/:id",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await DeletePatientCommand(ctx, id);
    });

    res.json({ success: true });
  })
);
