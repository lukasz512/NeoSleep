import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

export interface RequestWithId extends Request {
  requestId: string;
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as RequestWithId).requestId =
    (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
  next();
}
