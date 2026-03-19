import type { Request, Response } from "express";
import { getDb } from "../db.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export function parsePaginationParams(req: Request): {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
} {
  const page = Math.max(1, parseInt(String(req.query.page), 10) || DEFAULT_PAGE);
  const rawLimit = parseInt(String(req.query.limit), 10);
  const limit = rawLimit === -1 || rawLimit <= 0 ? MAX_LIMIT : Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy.trim() || "created_at" : "created_at";
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
  return { page, limit, sortBy, sortOrder };
}

export function toFilterArray(q: unknown): string[] | undefined {
  if (q === undefined || q === null) return undefined;
  if (Array.isArray(q)) {
    const arr = q.map((v) => String(v).trim()).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }
  const s = String(q).trim();
  return s ? [s] : undefined;
}

export function isoDate(val: Date | string | null | undefined): string {
  return val instanceof Date ? val.toISOString() : (val ?? "");
}

export function requireDb(res: Response): boolean {
  if (!getDb()) {
    res.status(503).json({ error: "Database not available. Ensure Postgres is running and DATABASE_URL is set." });
    return false;
  }
  return true;
}
