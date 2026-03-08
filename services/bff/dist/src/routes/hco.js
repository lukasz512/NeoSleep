import { Router } from "express";
import { getHCOPaginated, getHCOById } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
function parseHCOQuery(req) {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT));
    const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy.trim() || "created_at" : "created_at";
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const type = typeof req.query.type === "string" ? req.query.type.trim() : undefined;
    const region = typeof req.query.region === "string" ? req.query.region.trim() : undefined;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    return {
        page,
        limit,
        sortBy,
        sortOrder,
        filters: { search: search || undefined, type, region, status },
    };
}
export const hcoRouter = Router();
hcoRouter.get("/api/hco", asyncHandler(async (req, res) => {
    const { page, limit, sortBy, sortOrder, filters } = parseHCOQuery(req);
    const { rows, total } = await getHCOPaginated(filters, page, limit, sortBy, sortOrder);
    const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type ?? "",
        region: r.region,
        status: r.status,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
    res.json({ items, total });
}));
hcoRouter.get("/api/hco/:id", asyncHandler(async (req, res) => {
    const id = req.params.id?.trim();
    if (!id) {
        res.status(400).json({ error: "Missing HCO id" });
        return;
    }
    const hco = await getHCOById(id);
    if (!hco) {
        res.status(404).json({ error: "HCO not found" });
        return;
    }
    res.json({
        id: hco.id,
        name: hco.name,
        type: hco.type ?? "",
        region: hco.region,
        status: hco.status,
        created_at: hco.created_at instanceof Date ? hco.created_at.toISOString() : hco.created_at,
    });
}));
