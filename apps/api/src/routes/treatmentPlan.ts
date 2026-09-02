import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateTreatmentPlanCommand, UpdateTreatmentPlanCommand } from "../commands/treatmentPlan.js";
import { GetTreatmentPlanListQuery, GetTreatmentPlanByIdQuery } from "../queries/treatmentPlan.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams } from "./utils.js";

/**
 * Treatment plan routes — thin waiters. Generic across all treatment types
 * (cpap/apap/dental_appliance/positional/lifestyle/watchful_waiting) — the
 * OrthoApnea PWA tab filters to type='dental_appliance' client-side.
 */

export const treatmentPlanRouter: RouterType = Router();

interface TreatmentPlanBody {
  patient_id?: unknown;
  sleep_study_id?: unknown;
  type?: unknown;
  device_product_id?: unknown;
  device_purchase_order_id?: unknown;
  dentist_id?: unknown;
  dentist_notified_at?: unknown;
  dentist_accepted_at?: unknown;
  appointment_at?: unknown;
  scan_supplier_id?: unknown;
  scan_ordered_at?: unknown;
  scan_received_at?: unknown;
  scan_file_url?: unknown;
  appliance_supplier_id?: unknown;
  appliance_ordered_at?: unknown;
  appliance_delivered_at?: unknown;
  recommended_by?: unknown;
  notes?: unknown;
  status?: unknown;
  metadata?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function parseBody(body: TreatmentPlanBody) {
  return {
    device_product_id: str(body.device_product_id),
    device_purchase_order_id: str(body.device_purchase_order_id),
    dentist_id: str(body.dentist_id),
    dentist_notified_at: str(body.dentist_notified_at),
    dentist_accepted_at: str(body.dentist_accepted_at),
    appointment_at: str(body.appointment_at),
    scan_supplier_id: str(body.scan_supplier_id),
    scan_ordered_at: str(body.scan_ordered_at),
    scan_received_at: str(body.scan_received_at),
    scan_file_url: str(body.scan_file_url),
    appliance_supplier_id: str(body.appliance_supplier_id),
    appliance_ordered_at: str(body.appliance_ordered_at),
    appliance_delivered_at: str(body.appliance_delivered_at),
    recommended_by: str(body.recommended_by),
    notes: str(body.notes),
    status: str(body.status),
    metadata: obj(body.metadata),
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/treatment-plan — list (filterable by patient_id, type, status)
// ---------------------------------------------------------------------------
treatmentPlanRouter.get(
  "/treatment-plan",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const patientId = typeof req.query.patient_id === "string" ? req.query.patient_id.trim() : undefined;
    const type = typeof req.query.type === "string" ? req.query.type.trim() : undefined;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetTreatmentPlanListQuery(ctx, {
        patient_id: patientId || undefined,
        type: type || undefined,
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
// GET /api/v1/treatment-plan/:id — single treatment plan
// ---------------------------------------------------------------------------
treatmentPlanRouter.get(
  "/treatment-plan/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing treatment plan id");

    const slug = tenantSlugFromHost(req.hostname);
    const plan = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetTreatmentPlanByIdQuery(ctx, id);
    });

    if (!plan) { res.status(404).json({ error: "Treatment plan not found" }); return; }
    res.json(plan);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/treatment-plan — create
// ---------------------------------------------------------------------------
treatmentPlanRouter.post(
  "/treatment-plan",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as TreatmentPlanBody;
    const patientId = str(body.patient_id);
    const sleepStudyId = str(body.sleep_study_id);
    const type = str(body.type);
    if (!patientId) throw new ValidationError("patient_id is required");
    if (!sleepStudyId) throw new ValidationError("sleep_study_id is required");
    if (!type) throw new ValidationError("type is required");

    const slug = tenantSlugFromHost(req.hostname);
    const plan = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CreateTreatmentPlanCommand(ctx, {
        patient_id: patientId,
        sleep_study_id: sleepStudyId,
        type,
        ...parseBody(body),
      });
    });

    res.status(201).json(plan);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/treatment-plan/:id — update
// ---------------------------------------------------------------------------
treatmentPlanRouter.patch(
  "/treatment-plan/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing treatment plan id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as TreatmentPlanBody;
    const type = str(body.type);
    const plan = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return UpdateTreatmentPlanCommand(ctx, id, { type, ...parseBody(body) });
    });

    if (!plan) { res.status(404).json({ error: "Treatment plan not found" }); return; }
    res.json(plan);
  })
);
