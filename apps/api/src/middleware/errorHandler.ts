import type { Request, Response, NextFunction } from "express";
import type { RequestWithId } from "./requestId.js";
import { AppError, EmailInUseError, PartnerOrderAlreadySubmittedError, ValidationError } from "../errors.js";
import { insertDiagnostic, tenantSlugFromHost, type DiagnosticInsert } from "../db.js";
import { notifyNewErrorKind } from "../services/issueNotifications.js";

function isDiagnosticsEnabled(): boolean {
  return process.env.ENABLE_DIAGNOSTICS_DB === "1" || process.env.NODE_ENV === "production";
}

/** Records an API error with tenant and user, and emails the platform inbox when it is a new kind on prod. */
function recordApiError(req: Request, requestId: string | undefined, row: Pick<DiagnosticInsert, "message" | "stack" | "metadata">): void {
  const entry: DiagnosticInsert = {
    level: "error",
    message: row.message,
    stack: row.stack ?? null,
    source: "api",
    tenant_slug: tenantSlugFromHost(req.hostname),
    user_id: req.user?.sub ?? null,
    request_id: requestId ?? null,
    metadata: row.metadata ?? null,
  };
  insertDiagnostic(entry)
    .then((result) => notifyNewErrorKind(entry, result))
    .catch((e) => console.error("insertDiagnostic failed:", e));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as RequestWithId).requestId;

  if (err instanceof AppError) {
    console.error(`[${requestId}] ${err.code}: ${err.message}`, err.cause ?? "");

    if (isDiagnosticsEnabled() && err.statusCode >= 500) {
      recordApiError(req, requestId, {
        message: err.message,
        stack: err.stack ?? null,
        metadata: { code: err.code, cause: String(err.cause ?? ""), path: req.path },
      });
    }

    if (!res.headersSent) {
      const field =
        err instanceof ValidationError && err.field ? { field: err.field, reason: err.reason }
        : err instanceof EmailInUseError ? { field: err.field, reason: err.reason }
        : err instanceof PartnerOrderAlreadySubmittedError ? { externalId: err.externalId }
        : {};
      res.status(err.statusCode).json({ error: err.message, code: err.code, ...field });
    }
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[${requestId}] Unhandled error:`, message, stack ?? "");

  if (isDiagnosticsEnabled()) {
    recordApiError(req, requestId, { message: `Unhandled: ${message}`, stack: stack ?? null, metadata: { path: req.path } });
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
