import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireClinicalRole, requireStudyRole } from "../middleware/requireClinicalRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreatePatientCommand, UpdatePatientCommand, DeletePatientCommand } from "../commands/patient.js";
import { GetPatientListQuery, GetPatientByIdQuery } from "../queries/patient.js";
import { GetHistoryForPatientQuery } from "../queries/auditLog.js";
import { GetPatientDocumentsQuery, GetPatientDocumentDownloadUrlQuery } from "../queries/entityDocuments.js";
import { RecordClinicalQuestionnaireCommand, CompleteStopBangCommand } from "../commands/clinicalRecords.js";
import { PrintChecklistItemCommand, UploadPatientStudyCommand, DeletePatientStudyUploadCommand } from "../commands/patientChecklist.js";
import { GetPatientChecklistQuery } from "../queries/patientChecklist.js";
import multer from "multer";
import { isClinicalRecordKind, type ClinicalRecordKind } from "../commands/clinicalRecordFields.js";
import { ListClinicalRecordsQuery } from "../queries/clinicalRecords.js";
import { GetLatestSleepStudyRefQuery } from "../queries/sleepStudy.js";
import { CreateQuestionnaireRequestCommand, CancelQuestionnaireRequestCommand } from "../commands/questionnaireRequest.js";
import { AuditHealthDataReadCommand } from "../commands/healthDataReadAudit.js";
import { resolveFrontendOrigin } from "../utils/frontendOrigin.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams, toFilterArray, routeParam } from "./utils.js";

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

/** "Agregar estudio" uploads — same limits as sleep-study attachments (routes/sleepStudy.ts). */
const studyUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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
    const id = routeParam(req, "id")?.trim();
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
    const id = routeParam(req, "id")?.trim();
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
// GET /api/v1/patient/:id/sleep-study-ref — latest sleep study id only (any
// staff role; device orders need it, no clinical fields)
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/sleep-study-ref",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = routeParam(req, "id")?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const ref = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetLatestSleepStudyRefQuery(ctx, id);
    });
    res.json(ref);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/patient/:id/documents — Documents tab
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/documents",
  requireClinicalRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = routeParam(req, "id")?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const documents = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const result = await GetPatientDocumentsQuery(ctx, id);
      await AuditHealthDataReadCommand(ctx, { entity_type: "Patient", entity_id: id, patient_id: id, view: "documents" });
      return result;
    });
    res.json(documents);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/patient/:id/documents/:documentId/download — short-lived signed URL
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/documents/:documentId/download",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = routeParam(req, "id")?.trim();
    const documentId = routeParam(req, "documentId")?.trim();
    if (!id || !documentId) throw new ValidationError("Missing patient id or document id");

    const slug = tenantSlugFromHost(req.hostname);
    const url = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const signedUrl = await GetPatientDocumentDownloadUrlQuery(ctx, id, documentId);
      await AuditHealthDataReadCommand(ctx, { entity_type: "DocumentReference", entity_id: documentId, patient_id: id, view: "document-download" });
      return signedUrl;
    });
    res.json({ url });
  })
);

// ---------------------------------------------------------------------------
// Clinical questionnaires (Estudios) — medical history, oral exam, STOP-Bang.
// Migration 030 / ADR-023; replaces the 026 /endo-intake + /stop-bang routes.
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 400 for a malformed id instead of letting Postgres reject it as a 500 "invalid input syntax for type uuid". */
function uuidParam(req: Request, name: string): string {
  const value = routeParam(req, name)?.trim() ?? "";
  if (!UUID_RE.test(value)) throw new ValidationError(`Invalid ${name}`);
  return value;
}

function clinicalKindParam(req: Request): ClinicalRecordKind {
  const kind = routeParam(req, "kind");
  if (!isClinicalRecordKind(kind)) throw new ValidationError(`Unknown clinical record kind "${kind}"`);
  return kind;
}

patientRouter.get(
  "/patient/:id/clinical-records",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");

    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const records = await ListClinicalRecordsQuery(ctx, id);
      await AuditHealthDataReadCommand(ctx, { entity_type: "Patient", entity_id: id, patient_id: id, view: "clinical-records" });
      return records;
    });
    res.json(result);
  })
);

patientRouter.post(
  "/patient/:id/clinical-records/:kind",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");
    const kind = clinicalKindParam(req);

    const slug = tenantSlugFromHost(req.hostname);
    const record = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return RecordClinicalQuestionnaireCommand(ctx, id, kind, (req.body ?? {}) as Record<string, unknown>);
    });
    res.status(201).json(record);
  })
);

// The doctor completes B-A-N-G after the patient self-reported S-T-O-P.
patientRouter.patch(
  "/patient/:id/clinical-records/stop_bang/:recordId",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");
    const recordId = uuidParam(req, "recordId");

    const slug = tenantSlugFromHost(req.hostname);
    const record = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CompleteStopBangCommand(ctx, id, recordId, (req.body ?? {}) as Record<string, unknown>);
    });
    res.json(record);
  })
);

// ---------------------------------------------------------------------------
// Estudios checklist (ADR-024): the list, printing an item, uploading studies
// ---------------------------------------------------------------------------
patientRouter.get(
  "/patient/:id/checklist",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");
    const slug = tenantSlugFromHost(req.hostname);
    const checklist = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const result = await GetPatientChecklistQuery(ctx, id);
      await AuditHealthDataReadCommand(ctx, { entity_type: "Patient", entity_id: id, patient_id: id, view: "checklist" });
      return result;
    });
    res.json(checklist);
  })
);

// Streams a freshly rendered PDF (nothing stored), or — for a consent the
// patient already signed — returns { url } to the stored signed document.
patientRouter.post(
  "/patient/:id/checklist/:key/print",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");
    const key = routeParam(req, "key")?.trim() ?? "";
    const recordId = typeof req.body?.recordId === "string" && UUID_RE.test(req.body.recordId) ? req.body.recordId : undefined;
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return PrintChecklistItemCommand(ctx, id, key, recordId);
    });
    if (result.kind === "stored") {
      res.json({ url: result.url });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
    res.send(Buffer.from(result.bytes));
  })
);

patientRouter.post(
  "/patient/:id/studies/uploads",
  requireStudyRole,
  studyUpload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");
    if (!req.file) throw new ValidationError("A file is required");
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return UploadPatientStudyCommand(ctx, id, {
        bytes: new Uint8Array(req.file!.buffer),
        mimeType: req.file!.mimetype,
        filename: req.file!.originalname,
        title: req.body?.title,
        notes: req.body?.notes,
        checklistItem: req.body?.checklistItem,
      });
    });
    res.status(201).json(result);
  })
);

patientRouter.delete(
  "/patient/:id/studies/uploads/:attachmentId",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");
    const attachmentId = uuidParam(req, "attachmentId");
    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return DeletePatientStudyUploadCommand(ctx, id, attachmentId);
    });
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// Patient self-fill links (QR) — the public side lives in routes/public.ts
// ---------------------------------------------------------------------------
patientRouter.post(
  "/patient/:id/questionnaire-requests",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");

    const slug = tenantSlugFromHost(req.hostname);
    const origin = resolveFrontendOrigin(req);
    const { request, url } = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CreateQuestionnaireRequestCommand(ctx, id, (req.body ?? {}) as { items?: unknown; kind?: unknown }, origin);
    });
    res.status(201).json({ ...request, url });
  })
);

patientRouter.delete(
  "/patient/:id/questionnaire-requests/:requestId",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const id = uuidParam(req, "id");
    const requestId = uuidParam(req, "requestId");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CancelQuestionnaireRequestCommand(ctx, id, requestId);
    });
    res.status(204).end();
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
      gender?: string | null; date_of_birth?: string | null;
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
        gender:          typeof body.gender          === "string" ? body.gender : undefined,
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
    const id = routeParam(req, "id")?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      salutation?: string; first_name?: string; last_name?: string;
      email?: string; phone?: string;
      gender?: string | null; date_of_birth?: string | null;
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
        gender:          body.gender === null || typeof body.gender === "string" ? body.gender : undefined,
        date_of_birth:   body.date_of_birth === null || typeof body.date_of_birth === "string" ? body.date_of_birth : undefined,
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
    const id = routeParam(req, "id")?.trim();
    if (!id) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await DeletePatientCommand(ctx, id);
    });

    res.json({ success: true });
  })
);
