import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";
import type { RequestWithId } from "../middleware/requestId.js";

/**
 * Who/where of the HTTP request currently being handled, for audit rows.
 *
 * Every audit_log row used to get this context passed by hand at each of the
 * ~90 insertAuditLog() call sites, so most rows had no IP or user agent and
 * rows written after the transaction commits (e.g. the appointment email
 * `notify`) had not even a request_id. insertAuditLog() now reads it from
 * here and fills whatever the caller left out.
 *
 * The actor's country is read from `req.user` when the audit row is written,
 * not when the request starts, because requireAuth runs later, per route.
 * Background jobs (the lab-order sync) run outside any request, so their rows
 * stay without request context, which correctly marks them as the system.
 */
export interface RequestAuditContext {
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  /** PL | MX — the signed-in actor's country, which decides the retention period. */
  jurisdiction: string | null;
}

const storage = new AsyncLocalStorage<Request>();

/**
 * Mounted after every global body parser: a middleware that reads the request
 * stream calls next() from a stream callback, outside the context set here,
 * so routes that parse the stream themselves (multer uploads) re-enter it
 * with this same middleware after the upload middleware.
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run(req, next);
}

export function currentRequestContext(): RequestAuditContext | null {
  const req = storage.getStore();
  if (!req) return null;
  return {
    requestId: (req as Partial<RequestWithId>).requestId ?? null,
    ip: req.ip ?? null,
    userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
    jurisdiction: req.user?.country_code ?? null,
  };
}
