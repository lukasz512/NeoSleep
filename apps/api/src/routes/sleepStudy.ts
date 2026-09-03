import { Router, type Router as RouterType, type Request, type Response } from "express";
import multer from "multer";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateSleepStudyCommand, UpdateSleepStudyCommand, DeleteSleepStudyCommand } from "../commands/sleepStudy.js";
import { UploadSleepStudyAttachmentCommand, DeleteSleepStudyAttachmentCommand } from "../commands/sleepStudyAttachment.js";
import { GetSleepStudyListQuery, GetSleepStudyByIdQuery } from "../queries/sleepStudy.js";
import { GetSleepStudyAttachmentsQuery, GetSleepStudyAttachmentDownloadUrlQuery } from "../queries/sleepStudyAttachment.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams } from "./utils.js";

// In-memory buffer — attachments are small PDFs (results reports), never
// streamed to disk. 15MB is generous headroom over a typical few-hundred-KB
// polysomnography report.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * Sleep study routes — thin waiters. See CLAUDE.md pipeline conventions.
 * Non-admin "remove" is a status='cancelled' PATCH (table has no deleted_at
 * column, so that's the only reversible option). DELETE below is a genuine
 * hard delete, admin-only, for correcting mistakes (wrong patient, test
 * data) — not a clinical workflow action.
 */

export const sleepStudyRouter: RouterType = Router();

interface SleepStudyBody {
  patient_id?: unknown;
  purchase_order_id?: unknown;
  supplier_id?: unknown;
  device_serial?: unknown;
  device_shipped_at?: unknown;
  device_delivered_at?: unknown;
  device_returned_at?: unknown;
  study_date?: unknown;
  results_received_at?: unknown;
  raw_results?: unknown;
  ahi_score?: unknown;
  spo2_nadir?: unknown;
  odi?: unknown;
  interpreted_by?: unknown;
  interpreted_at?: unknown;
  interpretation?: unknown;
  diagnosis_code?: unknown;
  oa_indicated?: unknown;
  cpap_indicated?: unknown;
  status?: unknown;
  notes?: unknown;
  metadata?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}
function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function parseBody(body: SleepStudyBody) {
  return {
    purchase_order_id: str(body.purchase_order_id),
    supplier_id: str(body.supplier_id),
    device_serial: str(body.device_serial),
    device_shipped_at: str(body.device_shipped_at),
    device_delivered_at: str(body.device_delivered_at),
    device_returned_at: str(body.device_returned_at),
    study_date: str(body.study_date),
    results_received_at: str(body.results_received_at),
    raw_results: obj(body.raw_results),
    ahi_score: num(body.ahi_score),
    spo2_nadir: num(body.spo2_nadir),
    odi: num(body.odi),
    interpreted_by: str(body.interpreted_by),
    interpreted_at: str(body.interpreted_at),
    interpretation: str(body.interpretation),
    diagnosis_code: obj(body.diagnosis_code),
    oa_indicated: bool(body.oa_indicated),
    cpap_indicated: bool(body.cpap_indicated),
    status: str(body.status),
    notes: str(body.notes),
    metadata: obj(body.metadata),
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/sleep-study — list (filterable by patient_id, status)
// ---------------------------------------------------------------------------
sleepStudyRouter.get(
  "/sleep-study",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const patientId = typeof req.query.patient_id === "string" ? req.query.patient_id.trim() : undefined;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetSleepStudyListQuery(ctx, {
        patient_id: patientId || undefined,
        status: status || undefined,
        search: search || undefined,
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
// GET /api/v1/sleep-study/:id — single sleep study
// ---------------------------------------------------------------------------
sleepStudyRouter.get(
  "/sleep-study/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing sleep study id");

    const slug = tenantSlugFromHost(req.hostname);
    const study = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetSleepStudyByIdQuery(ctx, id);
    });

    if (!study) { res.status(404).json({ error: "Sleep study not found" }); return; }
    res.json(study);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/sleep-study — create
// ---------------------------------------------------------------------------
sleepStudyRouter.post(
  "/sleep-study",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as SleepStudyBody;
    const patientId = str(body.patient_id);
    if (!patientId) throw new ValidationError("patient_id is required");

    const slug = tenantSlugFromHost(req.hostname);
    const study = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CreateSleepStudyCommand(ctx, { patient_id: patientId, ...parseBody(body) });
    });

    res.status(201).json(study);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/sleep-study/:id — update
// ---------------------------------------------------------------------------
sleepStudyRouter.patch(
  "/sleep-study/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing sleep study id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as SleepStudyBody;
    const study = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return UpdateSleepStudyCommand(ctx, id, parseBody(body));
    });

    if (!study) { res.status(404).json({ error: "Sleep study not found" }); return; }
    res.json(study);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/sleep-study/:id/attachments — list PDF attachments
// ---------------------------------------------------------------------------
sleepStudyRouter.get(
  "/sleep-study/:id/attachments",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing sleep study id");

    const slug = tenantSlugFromHost(req.hostname);
    const attachments = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetSleepStudyAttachmentsQuery(ctx, id);
    });
    res.json({ items: attachments });
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/sleep-study/:id/attachments — upload a PDF (multipart, field "file")
// ---------------------------------------------------------------------------
sleepStudyRouter.post(
  "/sleep-study/:id/attachments",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing sleep study id");
    if (!req.file) throw new ValidationError("file is required");

    const slug = tenantSlugFromHost(req.hostname);
    const attachment = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return UploadSleepStudyAttachmentCommand(ctx, {
        sleepStudyId: id,
        filename: req.file!.originalname,
        mimeType: req.file!.mimetype,
        bytes: req.file!.buffer,
      });
    });
    res.status(201).json(attachment);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/sleep-study/:id/attachments/:attachmentId/download — short-lived signed URL
// ---------------------------------------------------------------------------
sleepStudyRouter.get(
  "/sleep-study/:id/attachments/:attachmentId/download",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    const attachmentId = req.params.attachmentId?.trim();
    if (!id || !attachmentId) throw new ValidationError("Missing sleep study id or attachment id");

    const slug = tenantSlugFromHost(req.hostname);
    const url = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetSleepStudyAttachmentDownloadUrlQuery(ctx, id, attachmentId);
    });
    res.json({ url });
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/sleep-study/:id/attachments/:attachmentId
// ---------------------------------------------------------------------------
sleepStudyRouter.delete(
  "/sleep-study/:id/attachments/:attachmentId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    const attachmentId = req.params.attachmentId?.trim();
    if (!id || !attachmentId) throw new ValidationError("Missing sleep study id or attachment id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await DeleteSleepStudyAttachmentCommand(ctx, id, attachmentId);
    });
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/sleep-study/:id — hard delete (admin-only)
// ---------------------------------------------------------------------------
sleepStudyRouter.delete(
  "/sleep-study/:id",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing sleep study id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await DeleteSleepStudyCommand(ctx, id);
    });
    res.json({ success: true });
  })
);
