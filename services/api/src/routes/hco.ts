import { Router, type Request, type Response } from "express";
import { getHCOPaginated, getHCOById, type GetHCOFilters } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parsePaginationParams, isoDate } from "./utils.js";

function parseHCOQuery(req: Request): { page: number; limit: number; sortBy: string; sortOrder: "asc" | "desc"; filters: GetHCOFilters } {
  const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  return {
    page, limit, sortBy, sortOrder,
    filters: {
      search: search || undefined,
      type: typeof req.query.type === "string" ? req.query.type.trim() : undefined,
      region: typeof req.query.region === "string" ? req.query.region.trim() : undefined,
      status: typeof req.query.status === "string" ? req.query.status.trim() : undefined,
    },
  };
}

export const hcoRouter = Router();

hcoRouter.get(
  "/api/hco",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder, filters } = parseHCOQuery(req);
    const { rows, total } = await getHCOPaginated(filters, page, limit, sortBy, sortOrder);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type ?? "",
      region: r.region,
      status: r.status,
      created_at: isoDate(r.created_at),
    }));
    res.json({ items, total });
  })
);

hcoRouter.get(
  "/api/hco/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing HCO id" }); return; }
    const hco = await getHCOById(id);
    if (!hco) { res.status(404).json({ error: "HCO not found" }); return; }
    res.json({
      id: hco.id,
      name: hco.name,
      type: hco.type ?? "",
      region: hco.region,
      status: hco.status,
      created_at: isoDate(hco.created_at),
    });
  })
);
