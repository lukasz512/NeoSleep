import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateAppointmentCommand, UpdateAppointmentCommand, DeleteAppointmentCommand } from "../commands/appointment.js";
import { GetAppointmentsQuery, GetAppointmentByIdQuery } from "../queries/appointment.js";
import { AuditHealthDataReadCommand } from "../commands/healthDataReadAudit.js";
import { ValidationError } from "../errors.js";
import { routeParam } from "./utils.js";

/**
 * Appointment routes (NEO-27, ADR-026) — thin waiters; every role rule lives
 * in commands/appointment.ts + queries/appointment.ts. Every staff role may
 * call these; what each one sees and may change is decided there.
 * Cancelling is PATCH { status: "cancelled" }; DELETE is an admin-only soft
 * delete for mistakes.
 */

export const appointmentRouter: RouterType = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !UUID_RE.test(v.trim())) throw new ValidationError(`${field} must be a UUID`);
  return v.trim();
}
/** Like uuid(), but an explicit null clears the link (PATCH). */
function nullableUuid(v: unknown, field: string): string | null | undefined {
  return v === null ? null : uuid(v, field);
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown, field: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${field} must be a number`);
  return v;
}
function idParam(req: Request): string {
  const id = routeParam(req, "id")?.trim() ?? "";
  if (!UUID_RE.test(id)) throw new ValidationError("Invalid appointment id");
  return id;
}
function queryStr(req: Request, name: string): string | undefined {
  const v = req.query[name];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// GET /api/v1/appointments?start=&end=&patient_id=&practitioner_id=
appointmentRouter.get(
  "/appointments",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const input = {
      start: queryStr(req, "start"),
      end: queryStr(req, "end"),
      patient_id: uuid(queryStr(req, "patient_id"), "patient_id"),
      practitioner_id: uuid(queryStr(req, "practitioner_id"), "practitioner_id"),
    };
    for (const key of ["start", "end"] as const) {
      if (input[key] && Number.isNaN(new Date(input[key]!).getTime())) throw new ValidationError(`${key} must be an ISO date-time`);
    }
    const slug = tenantSlugFromHost(req.hostname);
    const items = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const { viewer, items } = await GetAppointmentsQuery(ctx, input);
      if (viewer.kind !== "field") {
        await AuditHealthDataReadCommand(ctx, { entity_type: "Appointment", entity_id: null, patient_id: input.patient_id ?? null, view: "appointments-list" });
      }
      return items;
    });
    res.json({ items });
  })
);

// GET /api/v1/appointments/:id
appointmentRouter.get(
  "/appointments/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = idParam(req);
    const slug = tenantSlugFromHost(req.hostname);
    const appointment = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const item = await GetAppointmentByIdQuery(ctx, id);
      await AuditHealthDataReadCommand(ctx, { entity_type: "Appointment", entity_id: id, patient_id: item.patient_id, view: "appointment" });
      return item;
    });
    res.json(appointment);
  })
);

// POST /api/v1/appointments
appointmentRouter.post(
  "/appointments",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const input = {
      patient_id: uuid(body.patient_id, "patient_id"),
      practitioner_id: uuid(body.practitioner_id, "practitioner_id"),
      organization_id: uuid(body.organization_id, "organization_id"),
      start_at: str(body.start_at),
      end_at: str(body.end_at),
      duration_minutes: num(body.duration_minutes, "duration_minutes"),
      notes: str(body.notes),
      sleep_study_id: uuid(body.sleep_study_id, "sleep_study_id"),
      treatment_plan_id: uuid(body.treatment_plan_id, "treatment_plan_id"),
    };
    const slug = tenantSlugFromHost(req.hostname);
    const appointment = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CreateAppointmentCommand(ctx, input);
    });
    res.status(201).json(appointment);
  })
);

// PATCH /api/v1/appointments/:id — reschedule, status (incl. cancel), notes, clinical links
appointmentRouter.patch(
  "/appointments/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = idParam(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const input = {
      start_at: str(body.start_at),
      end_at: str(body.end_at),
      duration_minutes: num(body.duration_minutes, "duration_minutes"),
      status: str(body.status),
      notes: body.notes === null ? null : typeof body.notes === "string" ? body.notes.trim() || null : undefined,
      sleep_study_id: nullableUuid(body.sleep_study_id, "sleep_study_id"),
      treatment_plan_id: nullableUuid(body.treatment_plan_id, "treatment_plan_id"),
    };
    const slug = tenantSlugFromHost(req.hostname);
    const appointment = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return UpdateAppointmentCommand(ctx, id, input);
    });
    res.json(appointment);
  })
);

// DELETE /api/v1/appointments/:id — soft delete, admin-only
appointmentRouter.delete(
  "/appointments/:id",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = idParam(req);
    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await DeleteAppointmentCommand(ctx, id);
    });
    res.json({ success: true });
  })
);
