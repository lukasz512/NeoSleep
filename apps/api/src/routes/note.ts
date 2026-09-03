import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateNoteCommand, DeleteNoteCommand } from "../commands/note.js";
import { GetNotesForEntityQuery } from "../queries/note.js";
import { ValidationError } from "../errors.js";

/**
 * Note routes — thin waiters. Generic across patient/practitioner/organization/lead
 * (entity_type/entity_id), same shape as file_attachment.
 */

export const noteRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/note?entity_type=&entity_id= — notes for one entity
// ---------------------------------------------------------------------------
noteRouter.get(
  "/note",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const entityType = typeof req.query.entity_type === "string" ? req.query.entity_type.trim() : "";
    const entityId = typeof req.query.entity_id === "string" ? req.query.entity_id.trim() : "";
    if (!entityType || !entityId) throw new ValidationError("entity_type and entity_id are required");

    const slug = tenantSlugFromHost(req.hostname);
    const items = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return GetNotesForEntityQuery(ctx, entityType, entityId);
    });

    res.json({ items });
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/note — add a note
// ---------------------------------------------------------------------------
noteRouter.post(
  "/note",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { entity_type?: unknown; entity_id?: unknown; body?: unknown; metadata?: unknown };
    const slug = tenantSlugFromHost(req.hostname);

    const note = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return CreateNoteCommand(ctx, {
        entity_type: typeof body.entity_type === "string" ? body.entity_type : "",
        entity_id: typeof body.entity_id === "string" ? body.entity_id : "",
        body: typeof body.body === "string" ? body.body : "",
        metadata:
          body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      });
    });

    res.status(201).json(note);
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/note/:id — soft delete (author or admin, enforced in command)
// ---------------------------------------------------------------------------
noteRouter.delete(
  "/note/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing note id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await DeleteNoteCommand(ctx, id);
    });

    res.json({ success: true });
  })
);
