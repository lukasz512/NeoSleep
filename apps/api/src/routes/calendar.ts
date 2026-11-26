import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { GetCalendarListQuery } from "../queries/calendar.js";
import { AuditHealthDataReadCommand } from "../commands/healthDataReadAudit.js";

/**
 * Calendar routes (CORE-117) — the "Calendario" screen's union of encounters
 * (Planificador) and appointments (Citas), one list per date range. See
 * queries/calendar.ts for how each item's visibility is decided; this route
 * only parses input and (for the appointment half, matching routes/appointment.ts)
 * writes the GDPR read-audit entry for a non-field viewer.
 */

export const calendarRouter: RouterType = Router();

// GET /api/v1/calendar?start=&end=
calendarRouter.get(
  "/calendar",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const { items, appointmentViewer } = await GetCalendarListQuery(ctx, {
        start: typeof req.query.start === "string" ? req.query.start.trim() : undefined,
        end: typeof req.query.end === "string" ? req.query.end.trim() : undefined,
      });
      if (appointmentViewer.kind !== "field") {
        await AuditHealthDataReadCommand(ctx, { entity_type: "Appointment", entity_id: null, patient_id: null, view: "calendar-list" });
      }
      return items;
    });
    res.json({ items: result });
  })
);
