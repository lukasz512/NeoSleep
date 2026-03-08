/**
 * Global error handler: log to console and to tbl_console_errors when enabled, return 500 JSON.
 */
import type { Request, Response, NextFunction } from "express";
import { insertConsoleLog } from "../db.js";

function isLoggingToDbEnabled(): boolean {
  if (process.env.ENABLE_CONSOLE_LOG_DB === "1") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error("BFF error:", message, stack ?? "");

  if (isLoggingToDbEnabled()) {
    insertConsoleLog({
      level: "error",
      message: `BFF: ${message}`,
      stack: stack ?? null,
      source: "bff",
      metadata: stack ? { stack } : undefined,
    }).catch((e) => console.error("errorHandler insertConsoleLog failed:", e));
  }

  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
}

/** Wrap async route handlers so thrown errors are passed to error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
