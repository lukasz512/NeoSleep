import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { GetDoctorActionsQuery } from "../queries/doctorPanel.js";
import { AuditHealthDataReadCommand } from "../commands/healthDataReadAudit.js";

/** Doctor Panel (NEO-233) — tile ② "Needs your action". Tile ① reuses GET /appointments. */
export const doctorPanelRouter: RouterType = Router();

// GET /api/v1/doctor-panel/actions — the doctor's own queue; { enabled, items }.
doctorPanelRouter.get(
  "/doctor-panel/actions",
  requireRole("doctor"),
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const dto = await GetDoctorActionsQuery(ctx);
      if (dto.enabled) {
        await AuditHealthDataReadCommand(ctx, { entity_type: "Patient", entity_id: null, view: "doctor-panel-actions" });
      }
      return dto;
    });
    res.json(result);
  })
);
