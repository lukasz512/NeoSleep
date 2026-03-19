import { Router, type Request, type Response } from "express";
import { getPatientsPaginated } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const patientsRouter = Router();

patientsRouter.get(
  "/api/patients",
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10));
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const region = typeof req.query.region === "string" ? req.query.region : undefined;

    const { rows, total } = await getPatientsPaginated({ search, status, region }, page, limit);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      diagnosis: r.diagnosis,
      referred_by: r.referred_by,
      status: r.status,
      region: r.region,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
    res.json({ items, total });
  })
);
