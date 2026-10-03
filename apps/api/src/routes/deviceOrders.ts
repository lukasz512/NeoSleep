import { Router, type Router as RouterType, type Request, type Response } from "express";
import {
  parseDeviceOrder,
  PRODUCT_CODES,
  RULES_VERSION,
  validateDeliveryAddress,
  validateDeviceOrder,
  type DeliveryAddress,
  type DeviceOrder,
  type OrderIssue,
  type ProductCode,
} from "@neo/device-order";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireStudyRole } from "../middleware/requireClinicalRole.js";
import {
  withTenant,
  tenantSlugFromHost,
  insertAuditLog,
  getDeliveryOrganization,
  listDeliveryOrganizations,
  getTreatmentPlanById,
  getIdentityIdForUser,
  getPractitionerIdByIdentityId,
} from "../db.js";
import type { DeliveryOrganization } from "../db/practitionerOrganization.js";
import { buildContext, type TenantContext } from "../context/TenantContext.js";
import { requirePatientInScope, requirePractitionerInScope } from "../queries/entityAccess.js";
import { getDeviceOrderProvider } from "../services/deviceOrders/index.js";
import { ForbiddenError, NotFoundError } from "../errors.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireReconciliationJobSecret } from "../middleware/requireInternalJobSecret.js";
import { getLatestReconciliationRun, listReconciliationRuns } from "../db/deviceOrderReconciliation.js";
import {
  RunDeviceOrderReconciliationAllTenantsCommand,
  RunDeviceOrderReconciliationCommand,
} from "../commands/deviceOrderReconciliation.js";
import { DEPLOY_ENV } from "../env.js";

/**
 * Device orders (CORE-95) — the one way an order reaches a lab. The body is
 * our own DeviceOrder (packages/device-order), validated here with the same
 * rules the wizard runs, BEFORE anything is sent; only the provider adapter
 * (services/deviceOrders/) speaks the lab's wire format.
 *
 * Role gate: admin / doctor / manager (requireStudyRole). Reps, KAMs and MSLs
 * can't place a real, billable device order (NEO-199); this is the same gate
 * the patient's clinical records use.
 */
export const deviceOrdersRouter: RouterType = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_CODE_VALUES: readonly string[] = Object.values(PRODUCT_CODES);

function isProductCode(value: unknown): value is ProductCode {
  return typeof value === "string" && PRODUCT_CODE_VALUES.includes(value);
}

function toDeliveryAddress(org: DeliveryOrganization): DeliveryAddress {
  return {
    name: org.name ?? "",
    address: org.address_line1 ?? "",
    city: org.city ?? "",
    postalCode: org.postal_code ?? "",
    countryCode: org.country_code ?? "",
    phone: org.phone ?? "",
    email: org.email ?? "",
  };
}

/** One of the doctor's clinics, as the admin's delivery choice in the wizard (NEO-210 D2). */
interface DeliveryOption {
  organizationId: string;
  name: string;
  city: string | null;
  isPrimary: boolean;
}

/**
 * The dentist's delivery HCO plus what's missing on it (OA requires every
 * address field). By default the primary clinic; `chosenOrganizationId` (an
 * admin's choice, NEO-210 D2) must be one of the dentist's own clinics.
 */
async function resolveDelivery(
  ctx: TenantContext,
  dentistId: string,
  chosenOrganizationId: string | null = null
): Promise<{ delivery: DeliveryAddress | null; organizationId: string | null; issues: OrderIssue[]; options: DeliveryOption[] }> {
  await requirePractitionerInScope(ctx, dentistId);
  const all = await listDeliveryOrganizations(ctx.client, dentistId);
  const options = all.map((o) => ({ organizationId: o.id, name: o.name, city: o.city, isPrimary: o.is_primary }));
  const org = chosenOrganizationId
    ? (all.find((o) => o.id === chosenOrganizationId) ?? null)
    : await getDeliveryOrganization(ctx.client, dentistId);
  if (!org) {
    const issue: OrderIssue = chosenOrganizationId ? { path: "delivery_organization_id", code: "invalid" } : { path: "delivery", code: "required" };
    return { delivery: null, organizationId: null, issues: [issue], options };
  }
  const delivery = toDeliveryAddress(org);
  return { delivery, organizationId: org.id, issues: validateDeliveryAddress(delivery), options };
}

/**
 * The clinic an admin picked as the delivery address, or null for the
 * default (primary). Only an admin may choose (Łukasz, 2026-10-03, NEO-210
 * D2); anyone else sending one is refused rather than silently ignored.
 */
function chosenDeliveryOrganization(ctx: TenantContext, raw: unknown): string | null {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id) return null;
  if (ctx.user.role !== "admin") throw new ForbiddenError("Only an admin can choose another delivery clinic");
  // A malformed id can match no clinic, so it ends as the same "invalid" issue as a stranger's clinic.
  return UUID_RE.test(id) ? id : "00000000-0000-0000-0000-000000000000";
}

/**
 * The caller's own practitioner id when they are a doctor (users and
 * practitioner share identity_id, ADR-014), else null. A doctor orders only
 * as themselves, so only to their own clinic (Łukasz, 2026-10-03, NEO-210).
 */
async function ownPractitionerId(ctx: TenantContext): Promise<string | null> {
  if (ctx.user.role !== "doctor") return null;
  const identityId = await getIdentityIdForUser(ctx.client, ctx.user.id);
  const practitionerId = identityId ? await getPractitionerIdByIdentityId(ctx.client, identityId) : null;
  if (!practitionerId) throw new ForbiddenError("This doctor account is not linked to a practitioner record");
  return practitionerId;
}

/** The 400 every device-order validation failure answers with. */
function sendValidationError(res: Response, fields: OrderIssue[], warnings: OrderIssue[] = []): void {
  res.status(400).json({ error: "validation", fields, warnings, rulesVersion: RULES_VERSION });
}

// ---------------------------------------------------------------------------
// GET /api/v1/device-orders/context?dentist_id=<uuid>&product_code=002
// What the wizard needs before the doctor fills the order: where it ships
// (and what's missing there) and the lab's earliest desired date.
// ---------------------------------------------------------------------------
deviceOrdersRouter.get(
  "/device-orders/context",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const requested = typeof req.query.dentist_id === "string" ? req.query.dentist_id.trim() : "";
    const productCode = typeof req.query.product_code === "string" ? req.query.product_code.trim() : PRODUCT_CODES.NOA;
    // A doctor always orders as themselves, so they send no dentist_id (Łukasz, 2026-10-03, NEO-210).
    const isDoctor = req.user?.role === "doctor";
    const fields: OrderIssue[] = [];
    if (!isDoctor && !UUID_RE.test(requested)) fields.push({ path: "dentist_id", code: requested ? "invalid" : "required" });
    if (!isProductCode(productCode)) fields.push({ path: "product_code", code: "invalid" });
    if (fields.length > 0 || !isProductCode(productCode)) {
      sendValidationError(res, fields);
      return;
    }

    const slug = tenantSlugFromHost(req.hostname);
    const { dentistId, delivery, organizationId, issues, options, isAdmin } = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const chosen = chosenDeliveryOrganization(ctx, req.query.organization_id);
      const dentistId = (await ownPractitionerId(ctx)) ?? requested;
      return { dentistId, isAdmin: ctx.user.role === "admin", ...(await resolveDelivery(ctx, dentistId, chosen)) };
    });
    const minDesiredDate = await getDeviceOrderProvider().minDesiredDate(productCode);

    res.json({
      // The doctor the order is for — the caller's own practitioner record when they are a doctor.
      dentistId,
      // organizationId lets the wizard link to the HCO record to complete it.
      delivery: delivery ? { ...delivery, organizationId } : null,
      deliveryIssues: issues,
      // The doctor's clinics, primary first — only an admin may ship elsewhere (NEO-210 D2).
      ...(isAdmin ? { deliveryOptions: options } : {}),
      minDesiredDate,
      rulesVersion: RULES_VERSION,
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/device-orders
// body: { treatment_plan_id, patient_id, order: DeviceOrder }
// 400 { error: "validation", fields, warnings, rulesVersion } — nothing sent.
// 409 { code: PARTNER_ORDER_ALREADY_SUBMITTED, externalId } / PARTNER_ORDER_SUBMISSION_PENDING
//   (an interrupted submit older than RECONCILE_AFTER_MS is first looked up in the lab).
// 502 the lab refused or is down.
// 201 { externalId, externalStatus, warnings }.
// ---------------------------------------------------------------------------
deviceOrdersRouter.post(
  "/device-orders",
  requireStudyRole,
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { treatment_plan_id?: unknown; patient_id?: unknown; delivery_organization_id?: unknown; order?: unknown };
    const treatmentPlanId = typeof body.treatment_plan_id === "string" ? body.treatment_plan_id.trim() : "";
    const patientId = typeof body.patient_id === "string" ? body.patient_id.trim() : "";
    const idIssues: OrderIssue[] = [];
    if (!UUID_RE.test(treatmentPlanId)) idIssues.push({ path: "treatment_plan_id", code: treatmentPlanId ? "invalid" : "required" });
    if (!UUID_RE.test(patientId)) idIssues.push({ path: "patient_id", code: patientId ? "invalid" : "required" });
    if (idIssues.length > 0) {
      sendValidationError(res, idIssues);
      return;
    }

    const provider = getDeviceOrderProvider();
    const rawOrder = body.order;
    // Local rules first: an order that fails them costs no call to the lab at all.
    const localValidation = validateDeviceOrder(rawOrder);

    const slug = tenantSlugFromHost(req.hostname);
    const { ctx, delivery, deliveryIssues, planIssues } = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const chosen = chosenDeliveryOrganization(ctx, body.delivery_organization_id);
      await requirePatientInScope(ctx, patientId);
      const plan = await getTreatmentPlanById(client, treatmentPlanId);
      if (!plan) throw new NotFoundError("TreatmentPlan", treatmentPlanId);
      const planIssues: OrderIssue[] = [];
      if (plan.patient_id !== patientId) planIssues.push({ path: "patient_id", code: "invalid" });
      if (plan.type !== "dental_appliance") planIssues.push({ path: "treatment_plan_id", code: "invalid" });

      const dentistId = (rawOrder as { dentistId?: unknown } | null | undefined)?.dentistId;
      // An unusable dentistId is already reported by validateDeviceOrder.
      if (typeof dentistId !== "string" || !UUID_RE.test(dentistId)) {
        return { ctx, delivery: null, deliveryIssues: [], planIssues };
      }
      // A doctor orders only as themselves, hence only to their own clinic (NEO-210).
      const own = await ownPractitionerId(ctx);
      if (own !== null && own !== dentistId) throw new ForbiddenError("A doctor can only order as themselves");
      const { delivery, issues } = await resolveDelivery(ctx, dentistId, chosen);
      return { ctx, delivery, deliveryIssues: issues, planIssues };
    });

    const errors = [...planIssues, ...localValidation.errors, ...deliveryIssues];
    if (errors.length > 0 || !delivery) {
      sendValidationError(res, errors.length > 0 ? errors : [{ path: "delivery", code: "required" }], localValidation.warnings);
      return;
    }

    // The parsed order (defaults filled, unknown keys dropped) is what gets sent and audited — never the raw body.
    const order: DeviceOrder | null = parseDeviceOrder(rawOrder);
    if (!order) {
      sendValidationError(res, [{ path: "order", code: "invalid" }], localValidation.warnings);
      return;
    }
    // Then the one rule that needs the lab: the earliest desired date. When the
    // lab can't be asked (null), the lab itself is the judge on submit.
    const minDesiredDate = await provider.minDesiredDate(order.productCode);
    const validation = validateDeviceOrder(order, { minDesiredDate });
    if (validation.errors.length > 0) {
      sendValidationError(res, validation.errors, validation.warnings);
      return;
    }

    const receipt = await provider.submitOrder({ tenantSlug: slug, treatmentPlanId, patientId, order, delivery });

    // Its own short transaction: the provider already committed the partner
    // link/transaction rows around the HTTP call (ADR-017).
    await withTenant(slug, (client) =>
      insertAuditLog(client, {
        user_id: ctx.user.id,
        action: "create",
        entity_type: "PartnerOrder",
        entity_id: treatmentPlanId,
        entity_after: {
          provider: provider.name,
          externalId: receipt.externalId,
          externalStatus: receipt.externalStatus,
          rulesVersion: RULES_VERSION,
          order,
          delivery,
          dto: receipt.sentPayload,
        },
        request_id: ctx.requestId,
        metadata: { rulesVersion: RULES_VERSION, provider: provider.name, actingUserId: ctx.user.id, patientId },
      })
    );

    res.status(201).json({ externalId: receipt.externalId, externalStatus: receipt.externalStatus, warnings: validation.warnings });
  })
);

// ---------------------------------------------------------------------------
// Reconciliation (NEO-218): do our orders match the lab's?
// The full run lists lab patient names → admin only, and every read of it is
// audited. A manager sees the match counter only (Łukasz Q3).
// ---------------------------------------------------------------------------

/** What a manager may see of a run: no orders, no names. */
function counterOnly(run: { status: string; summary: { matchLevel?: number | null; matched?: number; mismatches?: number }; finished_at: string } | null) {
  if (!run) return null;
  return {
    status: run.status,
    matchLevel: run.summary.matchLevel ?? null,
    matched: run.summary.matched ?? 0,
    mismatches: run.summary.mismatches ?? 0,
    finishedAt: run.finished_at,
  };
}

// POST /api/v1/device-orders/reconciliation/run — "Check now" (admin).
deviceOrdersRouter.post(
  "/device-orders/reconciliation/run",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const ctx = await withTenant(slug, (client) => buildContext(req, client, slug));
    const run = await RunDeviceOrderReconciliationCommand(slug, { trigger: "manual", userId: ctx.user.id, requestId: ctx.requestId });
    res.status(201).json({ environment: DEPLOY_ENV, run });
  })
);

// GET /api/v1/device-orders/reconciliation/latest — admin: full run; manager: counter only.
deviceOrdersRouter.get(
  "/device-orders/reconciliation/latest",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const provider = getDeviceOrderProvider();
    const body = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const run = await getLatestReconciliationRun(client, provider.name);
      if (ctx.user.role !== "admin") return { environment: DEPLOY_ENV, counter: counterOnly(run) };
      if (run) {
        await insertAuditLog(client, {
          user_id: ctx.user.id,
          action: "read",
          entity_type: "DeviceOrderReconciliation",
          entity_id: run.id,
          request_id: ctx.requestId,
        });
      }
      return { environment: DEPLOY_ENV, counter: counterOnly(run), run };
    });
    res.json(body);
  })
);

// GET /api/v1/device-orders/reconciliation/runs?limit=30 — admin history (summaries, no orders).
deviceOrdersRouter.get(
  "/device-orders/reconciliation/runs",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const raw = Number(req.query.limit ?? 30);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : 30;
    const slug = tenantSlugFromHost(req.hostname);
    const items = await withTenant(slug, async (client) => {
      await buildContext(req, client, slug);
      return listReconciliationRuns(client, getDeviceOrderProvider().name, limit);
    });
    res.json({ items });
  })
);

// POST /api/v1/device-orders/jobs/reconcile — the daily job (GitHub Actions),
// machine-to-machine only; runs for every tenant that uses device orders.
deviceOrdersRouter.post(
  "/device-orders/jobs/reconcile",
  requireReconciliationJobSecret,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID();
    res.json(await RunDeviceOrderReconciliationAllTenantsCommand(requestId));
  })
);
