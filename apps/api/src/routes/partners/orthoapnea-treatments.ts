import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { requireInternalJobSecret } from "../../middleware/requireInternalJobSecret.js";
import { withTenant, tenantSlugFromHost, insertAuditLog, getPartnerTransactionHistory } from "../../db.js";
import { buildContext } from "../../context/TenantContext.js";
import {
  ensureOrthoApneaPatient,
  addOrthoApneaComment,
  fetchOrthoApneaProducts,
  fetchOrthoApneaClinics,
  fetchCountries,
} from "../../services/partners/orthoapnea.js";
import { SyncOrthoApneaTreatmentStatusesAllTenantsCommand } from "../../commands/orthoapneaSync.js";
import { CreateNoteCommand } from "../../commands/note.js";
import { ValidationError } from "../../errors.js";
import { routeParam } from "../utils.js";

/**
 * OrthoApnea order submission — patient create, treatment create, and the
 * internal status-sync job trigger. Order submission is queued/serialized
 * inside services/partners/orthoapnea.ts, not here — these handlers stay
 * thin per the routes convention (see routes/patient.ts header comment).
 */
export const orthoapneaTreatmentsRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// POST /api/v1/partners/orthoapnea/patients/:patientId/ensure
// Called when the order wizard opens — creates the OrthoApnea-side patient
// if one doesn't already exist yet for this local patient. Idempotent.
// ---------------------------------------------------------------------------
orthoapneaTreatmentsRouter.post(
  "/partners/orthoapnea/patients/:patientId/ensure",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = routeParam(req, "patientId")?.trim();
    if (!patientId) throw new ValidationError("Missing patient id");

    const slug = tenantSlugFromHost(req.hostname);
    // Short-lived transaction just to verify session/token_version before
    // touching the partner API — ensureOrthoApneaPatient manages its own
    // (separate, short) transactions around the OrthoApnea HTTP call itself
    // (see ADR-017 / that function's own doc comment for why).
    await withTenant(slug, (client) => buildContext(req, client, slug));
    const externalId = await ensureOrthoApneaPatient(slug, patientId);

    res.json({ externalId });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/products — device catalog for the order
// wizard's product picker. Read-only, no withTenant needed (proxies OA's own
// shared-account catalog, not tenant data).
// ---------------------------------------------------------------------------
orthoapneaTreatmentsRouter.get(
  "/partners/orthoapnea/products",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ items: await fetchOrthoApneaProducts() });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/clinics — wizard Step 1 "Clínica" select.
// ---------------------------------------------------------------------------
orthoapneaTreatmentsRouter.get(
  "/partners/orthoapnea/clinics",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ items: await fetchOrthoApneaClinics() });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/countries — wizard "Dirección alternativa"
// country select.
// ---------------------------------------------------------------------------
orthoapneaTreatmentsRouter.get(
  "/partners/orthoapnea/countries",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ items: await fetchCountries() });
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/partners/orthoapnea/treatments — 410 Gone (CORE-95).
// It passed the client's body to OrthoApnea unvalidated, in OA's own field
// names. Orders now go through POST /api/v1/device-orders, which validates
// our DeviceOrder with the shared rules first and builds OA's DTO itself, so
// an arbitrary body can never reach OrthoApnea again.
// ---------------------------------------------------------------------------
orthoapneaTreatmentsRouter.post("/partners/orthoapnea/treatments", requireAuth, (_req: Request, res: Response) => {
  res.status(410).json({
    error: "This endpoint was removed. Submit device orders to POST /api/v1/device-orders.",
    code: "GONE",
    replacement: "/api/v1/device-orders",
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/partners/orthoapnea/treatments/:treatmentPlanId/comments
// body: { body: string, notifyOrthoApnea?: boolean }
//
// Always saves a local note (entity_type: 'treatment_plan'). Only when
// `notifyOrthoApnea` is explicitly true does this ALSO call
// addOrthoApneaComment — which sends a real email to OrthoApnea's technical
// team (see that function's own doc comment). This must never be the
// default; the frontend gates it behind its own explicit, clearly-labeled
// opt-in — this route trusts that gate, it does not re-decide it.
// ---------------------------------------------------------------------------
orthoapneaTreatmentsRouter.post(
  "/partners/orthoapnea/treatments/:treatmentPlanId/comments",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const treatmentPlanId = routeParam(req, "treatmentPlanId")?.trim();
    if (!treatmentPlanId) throw new ValidationError("Missing treatment_plan id");

    const body = req.body as { body?: unknown; notifyOrthoApnea?: unknown };
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) throw new ValidationError("body is required");
    const notifyOrthoApnea = body.notifyOrthoApnea === true;

    const slug = tenantSlugFromHost(req.hostname);
    const { ctx, note } = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const note = await CreateNoteCommand(ctx, {
        entity_type: "treatment_plan",
        entity_id: treatmentPlanId,
        body: text,
      });
      return { ctx, note };
    });

    // addOrthoApneaComment manages its own (separate, short) transactions
    // around the OrthoApnea HTTP call (see ADR-017) — the audit-log write
    // below is deliberately its own short transaction too, not part of it.
    let orthoApneaResult: { notificationId: string; emailed: boolean } | null = null;
    if (notifyOrthoApnea) {
      orthoApneaResult = await addOrthoApneaComment(slug, treatmentPlanId, text);
      await withTenant(slug, (client) =>
        insertAuditLog(client, {
          user_id: ctx.user.id,
          action: "create",
          entity_type: "PartnerOrder",
          entity_id: treatmentPlanId,
          entity_after: { action: "add_comment", ...orthoApneaResult },
          request_id: ctx.requestId,
        })
      );
    }

    res.status(201).json({ note, orthoApnea: orthoApneaResult });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/partners/orthoapnea/treatments/:treatmentPlanId/transactions
// Admin-only (requireRole("admin"), same gate as e.g. DELETE /sleep-study/:id) —
// this exposes the full request/response JSON exchanged with OrthoApnea for
// one order, including patient PII (name, email, phone) baked into the
// stored payloads. Used by the admin-only transaction-log UI (debugging +
// verifying "the JSON we think we sent" matches what was actually sent —
// see ADR-017).
// ---------------------------------------------------------------------------
orthoapneaTreatmentsRouter.get(
  "/partners/orthoapnea/treatments/:treatmentPlanId/transactions",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const treatmentPlanId = routeParam(req, "treatmentPlanId")?.trim();
    if (!treatmentPlanId) throw new ValidationError("Missing treatment_plan id");

    const slug = tenantSlugFromHost(req.hostname);
    const history = await withTenant(slug, (client) =>
      getPartnerTransactionHistory(client, "orthoapnea", "treatment_plan", treatmentPlanId)
    );

    res.json(history);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/partners/orthoapnea/jobs/sync-statuses
// Machine-to-machine only (requireInternalJobSecret) — called by an external
// scheduler (Render Cron Job / GitHub Actions schedule), not a logged-in
// user, so there is no requireAuth/buildContext here.
//
// Runs once per ACTIVE tenant (platform.tenants), not tenantSlugFromHost() —
// that helper is a single-tenant stub (see db/tenant.ts) that would silently
// only ever sync one tenant. One tenant's failure doesn't abort the others;
// see SyncOrthoApneaTreatmentStatusesAllTenantsCommand's own doc comment.
// ---------------------------------------------------------------------------
orthoapneaTreatmentsRouter.post(
  "/partners/orthoapnea/jobs/sync-statuses",
  requireInternalJobSecret,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID();
    const result = await SyncOrthoApneaTreatmentStatusesAllTenantsCommand(requestId);
    res.json(result);
  })
);
