import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

export interface RequestWithId extends Request {
  requestId: string;
}

export const REQUEST_ID_HEADER = "X-Request-ID";

/**
 * An incoming X-Request-ID (e.g. from a proxy) is reused only when it is a
 * short, plain token — it is echoed back in a response header and written to
 * logs/diagnostics, so arbitrary client input must not pass through.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Assigns every request a correlation id and returns it as `X-Request-ID` on
 * the response (NEO-81), so a browser-side error report (reportCaught sends it
 * as `request_id`) can be matched to the server's own log line and
 * diagnostics row. Exposed to cross-origin frontends via CORS `exposedHeaders`
 * in server.ts.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const requestId = typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  (req as RequestWithId).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
