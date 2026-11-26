/**
 * POST /api/diagnostics – accept diagnostic log payloads from frontend or API and persist to diagnostics.
 * Enabled only when ENABLE_DIAGNOSTICS_DB=1 or NODE_ENV=production.
 */
import { Request, Response, Router } from "express";
import { insertDiagnostic, tenantSlugFromHost } from "../db.js";
import { getOptionalUser } from "../utils/jwt.js";
import { notifyNewErrorKind } from "../services/issueNotifications.js";
import { isClientRejection, queueErrorTicket, runErrorDigest } from "../services/errorTickets.js";
import { requireInternalJobSecret } from "../middleware/requireInternalJobSecret.js";
import { DEPLOY_ENV } from "../env.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { diagnosticsLimiter } from "../middleware/rateLimiter.js";

const router = Router();

function isDiagnosticsEnabled(): boolean {
  if (process.env.ENABLE_DIAGNOSTICS_DB === "1") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

/** Shape of the POST /api/diagnostics request body (all fields are optional until validated). */
interface DiagnosticBody {
  message?: unknown;
  level?: unknown;
  stack?: unknown;
  source?: unknown;
  user_id?: unknown;
  request_id?: unknown;
  metadata?: unknown;
}

router.post(
  "/diagnostics",
  diagnosticsLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    if (!isDiagnosticsEnabled()) {
      res.status(204).end();
      return;
    }

    const body = req.body as DiagnosticBody;
    if (!body || typeof body.message !== "string") {
      res.status(400).json({ error: "message required" });
      return;
    }

    const levelRaw = typeof body.level === "string" ? body.level : "";
    const level = (["log", "info", "warn", "error"] as const).includes(levelRaw as "log") ? levelRaw : "log";
    const message = String(body.message).slice(0, 10000);
    const stack = typeof body.stack === "string" ? body.stack.slice(0, 50000) : null;
    const source: "frontend" | "api" = body.source === "frontend" ? "frontend" : "api";
    const env = DEPLOY_ENV;
    // The caller is unauthenticated by design; when a valid token happens to be present, trust it over the body.
    const userId = getOptionalUser(req)?.sub ?? (typeof body.user_id === "string" ? body.user_id.slice(0, 256) : null);
    const requestId = typeof body.request_id === "string" ? body.request_id.slice(0, 256) : null;
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null;

    const entry = {
      level,
      message,
      stack: stack ?? null,
      source,
      env,
      tenant_slug: tenantSlugFromHost(req.hostname),
      user_id: userId,
      request_id: requestId,
      metadata,
    };
    // A 4xx is the app saying no, not a bug (CORE-190); older cached clients still report them.
    if (source === "frontend" && isClientRejection(entry)) {
      res.status(204).end();
      return;
    }
    const result = await insertDiagnostic(entry);
    notifyNewErrorKind(entry, result);
    queueErrorTicket(entry, result);

    res.status(204).end();
  })
);

// POST /api/v1/diagnostics/jobs/digest — CORE-190 morning digest: new error tickets, what the
// night fixed, daily counters and priorities. Called by .github/workflows/error-digest.yml.
router.post(
  "/diagnostics/jobs/digest",
  requireInternalJobSecret,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await runErrorDigest());
  })
);

export const diagnosticsRouter: import("express").Router = router;
