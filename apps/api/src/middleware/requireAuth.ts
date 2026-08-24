import { Request, Response, NextFunction } from "express";
import { getBearerToken, verifyAuthToken } from "../utils/jwt.js";

/** Middleware that rejects unauthenticated requests with 401. Signature+expiry check only,
 *  no DB call — deliberately fast and works offline-first (see TenantContext.buildContext
 *  for the stronger token_version revocation check, which does need a DB client). */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    req.user = verifyAuthToken(token);
  } catch {
    // Don't distinguish expired vs. tampered/invalid in the response — same 401 either way.
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
