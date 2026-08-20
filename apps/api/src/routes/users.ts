import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { CreateUserCommand, UpdateUserCommand, DeleteUserCommand, ResetUserPasswordCommand } from "../commands/users.js";
import { GetUserListQuery, GetUserByIdQuery } from "../queries/users.js";
import { GetUserDocumentsQuery, GetUserDocumentDownloadUrlQuery } from "../queries/documents.js";
import { ValidationError } from "../errors.js";
import { parsePaginationParams, toFilterArray } from "./utils.js";
import type { StaffRole } from "../db.js";
import { resolveFrontendOrigin } from "../utils/frontendOrigin.js";

/**
 * User routes — thin waiters. See routes/practitioner.ts for the pattern.
 * No SQL, no business logic, no audit writes here.
 */

export const usersRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/users — list users in tenant
// ---------------------------------------------------------------------------
usersRouter.get(
  "/users",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    const result = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetUserListQuery(ctx, {
        search: search || undefined,
        role: toFilterArray(req.query.role),
        status: toFilterArray(req.query.status),
        page,
        limit,
        sortBy,
        sortOrder,
      });
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/users/:id — single user
// ---------------------------------------------------------------------------
usersRouter.get(
  "/users/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing user id");

    const slug = tenantSlugFromHost(req.hostname);
    const user = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetUserByIdQuery(ctx, id);
    });

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/users — create a new user
// ---------------------------------------------------------------------------
usersRouter.post(
  "/users",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      salutation?: string; first_name?: string; last_name?: string; email?: string; password?: string;
      role?: StaffRole; region?: string; country_code?: string; phone?: string;
    };

    const user = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return CreateUserCommand(ctx, {
        salutation: typeof body.salutation === "string" ? body.salutation : null,
        first_name: typeof body.first_name === "string" ? body.first_name : "",
        last_name: typeof body.last_name === "string" ? body.last_name : "",
        email: typeof body.email === "string" ? body.email : "",
        password: typeof body.password === "string" ? body.password : null,
        role: body.role,
        region: typeof body.region === "string" ? body.region : null,
        country_code: typeof body.country_code === "string" ? body.country_code : null,
        phone: typeof body.phone === "string" ? body.phone : null,
      });
    });

    res.status(201).json(user);
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/users/:id — update user (status, profile fields)
// ---------------------------------------------------------------------------
usersRouter.patch(
  "/users/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing user id");

    const slug = tenantSlugFromHost(req.hostname);
    const body = req.body as {
      salutation?: string; first_name?: string; last_name?: string; phone?: string;
      status?: "active" | "inactive" | "suspended"; country_code?: string; role?: StaffRole;
    };

    const user = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return UpdateUserCommand(ctx, id, {
        salutation: body.salutation !== undefined ? body.salutation : undefined,
        first_name: typeof body.first_name === "string" ? body.first_name : undefined,
        last_name: typeof body.last_name === "string" ? body.last_name : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
        status: body.status,
        country_code: body.country_code !== undefined ? body.country_code : undefined,
        role: body.role,
      });
    });

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/users/:id/reset-password — admin/manager triggers a reset email
// ---------------------------------------------------------------------------
usersRouter.post(
  "/users/:id/reset-password",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing user id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      await ResetUserPasswordCommand(ctx, id, resolveFrontendOrigin(req));
    });

    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/users/:id/documents — signed GDPR/partner-agreement documents
// ---------------------------------------------------------------------------
usersRouter.get(
  "/users/:id/documents",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing user id");

    const slug = tenantSlugFromHost(req.hostname);
    const documents = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetUserDocumentsQuery(ctx, id);
    });
    res.json(documents);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/users/:id/documents/:documentId/download — short-lived signed URL
// ---------------------------------------------------------------------------
usersRouter.get(
  "/users/:id/documents/:documentId/download",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    const documentId = req.params.documentId?.trim();
    if (!id || !documentId) throw new ValidationError("Missing user id or document id");

    const slug = tenantSlugFromHost(req.hostname);
    const url = await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      return GetUserDocumentDownloadUrlQuery(ctx, id, documentId);
    });
    res.json({ url });
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/users/:id — soft delete
// ---------------------------------------------------------------------------
usersRouter.delete(
  "/users/:id",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing user id");

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const ctx = buildContext(req, client, slug);
      await DeleteUserCommand(ctx, id);
    });

    res.json({ success: true });
  })
);
