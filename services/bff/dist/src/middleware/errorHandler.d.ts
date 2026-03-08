/**
 * Global error handler: log to console and to tbl_console_errors when enabled, return 500 JSON.
 */
import type { Request, Response, NextFunction } from "express";
export declare function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void;
/** Wrap async route handlers so thrown errors are passed to error middleware. */
export declare function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): (req: Request, res: Response, next: NextFunction) => void;
