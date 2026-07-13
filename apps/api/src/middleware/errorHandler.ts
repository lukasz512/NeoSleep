import type { Request, Response, NextFunction } from "express";
import type { RequestWithId } from "./requestId.js";
import { AppError } from "../errors.js";
import { insertDiagnostic } from "../db.js";

function isDiagnosticsEnabled(): boolean {
  return process.env.ENABLE_DIAGNOSTICS_DB === "1" || process.env.NODE_ENV === "production";
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as RequestWithId).requestId;

  if (err instanceof AppError) {
    console.error(`[${requestId}] ${err.code}: ${err.message}`, err.cause ?? "");

    if (isDiagnosticsEnabled() && err.statusCode >= 500) {
      insertDiagnostic({
        level: "error",
        message: err.message,
        stack: err.stack ?? null,
        source: "api",
        request_id: requestId ?? null,
        metadata: { code: err.code, cause: String(err.cause ?? "") },
      }).catch((e) => console.error("insertDiagnostic failed:", e));
    }

    if (!res.headersSent) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[${requestId}] Unhandled error:`, message, stack ?? "");

  if (isDiagnosticsEnabled()) {
    insertDiagnostic({
      level: "error",
      message: `Unhandled: ${message}`,
      stack: stack ?? null,
      source: "api",
      request_id: requestId ?? null,
    }).catch((e) => console.error("insertDiagnostic failed:", e));
  }

  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
