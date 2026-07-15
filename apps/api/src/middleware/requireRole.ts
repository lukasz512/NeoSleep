import type { Request, Response, NextFunction } from "express";
import { AuthError, ForbiddenError } from "../errors.js";
import type { StaffRole } from "../db.js";

/** No session → 401 (AuthError). Session but wrong role → 403 (ForbiddenError). */
export function requireRole(...roles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const session = req.session as { user?: { role: StaffRole } } | undefined;
    const user = session?.user;
    if (!user) {
      next(new AuthError("Authentication required"));
      return;
    }
    if (!roles.includes(user.role)) {
      next(new ForbiddenError("Insufficient permissions"));
      return;
    }
    next();
  };
}
