import { Router, type Request, type Response } from "express";
import { getPresentations, getPresentationById } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const presentationsRouter = Router();

presentationsRouter.get(
  "/api/presentations",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await getPresentations();
    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      file_type: r.file_type,
      thumbnail_url: r.thumbnail_url ?? null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
    res.json({ items });
  })
);

presentationsRouter.get(
  "/api/presentations/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing presentation id" });
      return;
    }
    const p = await getPresentationById(id);
    if (!p) {
      res.status(404).json({ error: "Presentation not found" });
      return;
    }
    res.json({
      id: p.id,
      title: p.title,
      url: p.url,
      file_type: p.file_type,
      thumbnail_url: p.thumbnail_url ?? null,
      created_at: p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at,
    });
  })
);
