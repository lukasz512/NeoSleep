/**
 * POST /api/logs – accept console-style log payloads from frontend or BFF and persist to tbl_console_errors.
 * Enabled only when ENABLE_CONSOLE_LOG_DB=1 or NODE_ENV=production. See CONSOLE_LOGS_AND_SELF_HEALING.md.
 */
import { Request, Response, Router } from "express";
import crypto from "crypto";
import { insertConsoleLog } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

function isLoggingToDbEnabled(): boolean {
  if (process.env.ENABLE_CONSOLE_LOG_DB === "1") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

function hashMessage(message: string): string {
  const normalized = String(message).trim().slice(0, 2000);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

router.post(
  "/api/logs",
  asyncHandler(async (req: Request, res: Response) => {
    if (!isLoggingToDbEnabled()) {
      res.status(204).end();
      return;
    }

    const body = req.body;
    if (!body || typeof body.message !== "string") {
      res.status(400).json({ error: "message required" });
      return;
    }

    const level = ["log", "info", "warn", "error"].includes(body.level) ? body.level : "log";
    const message = String(body.message).slice(0, 10000);
    const stack = typeof body.stack === "string" ? body.stack.slice(0, 50000) : null;
    const source = body.source === "frontend" ? "frontend" : "bff";
    const env = process.env.NODE_ENV ?? "development";
    const userId = typeof body.user_id === "string" ? body.user_id.slice(0, 256) : null;
    const requestId = typeof body.request_id === "string" ? body.request_id.slice(0, 256) : null;
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null;

    const message_hash = hashMessage(message);

    await insertConsoleLog({
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

export const logsRouter = router;
