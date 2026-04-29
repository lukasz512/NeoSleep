import { Router, type Request, type Response } from "express";
import { getPresentations, getPresentationById } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const presentationsRouter: import('express').Router = Router();

presentationsRouter.get(
  "/presentations",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await getPresentations();
    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      // file_url is canonical; url is the backward-compat alias
      file_url: r.file_url,
      url: r.url,
      thumbnail_url: r.thumbnail_url ?? null,
      locale: r.locale ?? null,
      tags: r.tags ?? [],
      status: r.status,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
    res.json({ items });
  })
);

presentationsRouter.get(
  "/presentations/:id",
  requireAuth,
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
      file_url: p.file_url,
      url: p.url,
      thumbnail_url: p.thumbnail_url ?? null,
      locale: p.locale ?? null,
      tags: p.tags ?? [],
      status: p.status,
      metadata: p.metadata ?? null,
      created_at: p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at,
    });
  })
);
