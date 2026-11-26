import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { NotFoundError } from "../errors.js";
import { routeParam } from "./utils.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { listResourceProgress, saveResourceProgress, type ResourceProgressRow } from "../db/resourceProgress.js";

/**
 * Opened state of the app's own PDFs on Resources (the care protocol and the
 * user guide). One row per user and document in resource_progress, with
 * partner = 'neosleep': opened = completed, not opened = not_started. Only the
 * user's own "what have I opened" list; nobody else reads it.
 */
export const resourceDocumentsRouter: RouterType = Router();

const PARTNER = "neosleep";

/** Ids of the PDFs under apps/pwa/src/config/featuredResources.ts; anything else is a 404. */
export const OWN_DOCUMENT_IDS: readonly string[] = ["protocolo-atencion", "guia-uso"];

function documentIdParam(req: Request): string {
  const id = routeParam(req, "id")?.trim() ?? "";
  if (!OWN_DOCUMENT_IDS.includes(id)) throw new NotFoundError("Document not found");
  return id;
}

function toDto(row: ResourceProgressRow) {
  return { resourceId: row.resource_id, status: row.status, completedAt: row.completed_at, updatedAt: row.updated_at };
}

// GET /api/v1/resources/documents/progress — the caller's own rows
resourceDocumentsRouter.get(
  "/resources/documents/progress",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const rows = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return listResourceProgress(client, ctx.user.id, PARTNER);
    });
    res.json({ progress: rows.map(toDto) });
  })
);

async function setOpened(req: Request, res: Response, opened: boolean): Promise<void> {
  const id = documentIdParam(req);
  const slug = tenantSlugFromHost(req.hostname);
  const row = await withTenant(slug, async (client) => {
    const ctx = await buildContext(req, client, slug);
    return saveResourceProgress(client, ctx.user.id, PARTNER, id, {
      status: opened ? "completed" : "not_started",
      positionSec: 0,
      maxPositionSec: 0,
      durationSec: null,
    });
  });
  res.json(toDto(row));
}

// PUT /api/v1/resources/documents/:id/opened — the user opened the file
resourceDocumentsRouter.put(
  "/resources/documents/:id/opened",
  requireAuth,
  asyncHandler((req, res) => setOpened(req, res, true))
);

// DELETE /api/v1/resources/documents/:id/opened — mark as not opened again
resourceDocumentsRouter.delete(
  "/resources/documents/:id/opened",
  requireAuth,
  asyncHandler((req, res) => setOpened(req, res, false))
);
