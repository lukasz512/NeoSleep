/**
 * POST /api/diagnostics – accept diagnostic log payloads from frontend or API and persist to diagnostics.
 * Enabled only when ENABLE_DIAGNOSTICS_DB=1 or NODE_ENV=production.
 */
import { Request, Response, Router } from "express";
import crypto from "crypto";
import { insertDiagnostic } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

function isDiagnosticsEnabled(): boolean {
  if (process.env.ENABLE_DIAGNOSTICS_DB === "1") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

function hashMessage(message: string): string {
  const normalized = String(message).trim().slice(0, 2000);
  return crypto.createHash("sha256").update(normalized).digest("hex");
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
    const env = process.env.NODE_ENV ?? "development";
    const userId = typeof body.user_id === "string" ? body.user_id.slice(0, 256) : null;
    const requestId = typeof body.request_id === "string" ? body.request_id.slice(0, 256) : null;
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null;

    const message_hash = hashMessage(message);

    await insertDiagnostic({
      level,
      message,
      message_hash,
      stack: stack ?? null,
      source,
      env,
      user_id: userId,
      request_id: requestId,
      metadata,
    });

    res.status(204).end();
  })
);

export const diagnosticsRouter: import("express").Router = router;
