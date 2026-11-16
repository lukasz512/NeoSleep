import type { Request, Response, NextFunction } from "express";
import { getBearerToken, verifyAuthToken } from "../utils/jwt.js";

/**
 * NeoCRM support (CORE-197, migration 064) is deny-by-default: a signed-in
 * 'support' user reaches only the API behind Calendar, Resources, Documents,
 * Reports (+ Errors) and the work board, plus the app shell's own calls
 * (session, config, notifications, problem reports). Everything else is a 403
 * here, before any router runs, so a route guarded only by requireAuth (most
 * patient, HCP and lead reads) never sees a support user.
 *
 * Paths are relative to /api/v1. A route this list doesn't name stays closed
 * to support even when its own requireRole would let it through.
 */
const SUPPORT_ALLOWED: ReadonlyArray<{ methods?: readonly string[]; path: RegExp }> = [
  { path: /^\/auth\// },
  { methods: ["GET"], path: /^\/config\/(app|i18n)$/ },
  { methods: ["GET"], path: /^\/lookups(\/|$)/ },
  { path: /^\/notification(\/|$)/ },
  { path: /^\/push\/subscribe$/ },
  { path: /^\/problem-reports(\/mine)?$/ },
  { methods: ["GET"], path: /^\/calendar$/ },
  { path: /^\/resources\/documents(\/|$)/ },
  { methods: ["GET"], path: /^\/partners\/orthoapnea\/status$/ },
  { path: /^\/partners\/orthoapnea\/resources(\/|$)/ },
  { path: /^\/document-content(\/|$)/ },
  { path: /^\/admin\/(issues\/access|problem-reports|diagnostics)(\/|$)/ },
  { path: /^\/platform\/work(\/|$)/ },
];

export function isSupportAllowed(method: string, path: string): boolean {
  return SUPPORT_ALLOWED.some((rule) => rule.path.test(path) && (!rule.methods || rule.methods.includes(method)));
}

/** Mounted on /api/v1 ahead of every router. A missing or invalid token passes through untouched: the route's own guard answers 401. */
export function supportAllowlist(req: Request, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    next();
    return;
  }
  let role: string;
  try {
    role = verifyAuthToken(token).role;
  } catch {
    next();
    return;
  }
  if (role === "support" && !isSupportAllowed(req.method, req.path)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  next();
}
