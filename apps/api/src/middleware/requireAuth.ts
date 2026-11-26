import { Request, Response, NextFunction } from "express";
import { getBearerToken, verifyAuthToken, verifyMediaToken } from "../utils/jwt.js";

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

/** For partner media only: a normal Bearer login, or a media token in `?t=`
 *  (see signMediaToken) — `<video src>` can't send headers. Same 401 either way. */
export function requirePartnerMediaAuth(req: Request, res: Response, next: NextFunction): void {
  if (getBearerToken(req)) {
    requireAuth(req, res, next);
    return;
  }
  const token = typeof req.query.t === "string" ? req.query.t : null;
  try {
    if (!token) throw new Error("missing");
    verifyMediaToken(token);
  } catch {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
