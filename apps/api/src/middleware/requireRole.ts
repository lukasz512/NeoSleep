import type { Request, Response, NextFunction } from "express";
import { AuthError, ForbiddenError } from "../errors.js";
import { getBearerToken, verifyAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/** No/invalid token → 401 (AuthError). Valid token but wrong role → 403 (ForbiddenError).
 *  Several routes mount this standalone, without a preceding requireAuth — so, same as the
 *  old direct req.session read this replaces, it verifies the token itself rather than
 *  assuming req.user is already populated (though it reuses it when requireAuth did run first). */
export function requireRole(...roles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      const token = getBearerToken(req);
      if (!token) {
        next(new AuthError("Authentication required"));
        return;
      }
      try {
        req.user = verifyAuthToken(token);
      } catch {
        next(new AuthError("Authentication required"));
        return;
      }
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError("Insufficient permissions"));
      return;
    }
    next();
  };
}
