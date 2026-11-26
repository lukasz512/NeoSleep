import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireInternalJobSecret } from "../middleware/requireInternalJobSecret.js";
import { RunKpiSnapshotAllTenants, parseKpiDay } from "../commands/kpiSnapshot.js";

export const kpiRouter: import("express").Router = Router();

// POST /api/v1/kpi/jobs/snapshot { day?: "YYYY-MM-DD" } — CORE-213 nightly kpi_snapshot for
// every tenant (default: yesterday, UTC). Machine-to-machine only, called by
// .github/workflows/kpi-snapshot.yml.
kpiRouter.post(
  "/kpi/jobs/snapshot",
  requireInternalJobSecret,
  asyncHandler(async (req: Request, res: Response) => {
    const day = parseKpiDay((req.body as { day?: unknown } | undefined)?.day);
    res.json(await RunKpiSnapshotAllTenants(day));
  })
);
