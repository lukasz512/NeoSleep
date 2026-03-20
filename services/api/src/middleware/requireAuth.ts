import { Request, Response, NextFunction } from "express";

/** Middleware that rejects unauthenticated requests with 401. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as { user?: { id: string } } | undefined;
  if (!session?.user?.id) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
