import { Router, type Request, type Response } from "express";
import { getOrganizationPaginated, getOrganizationById, withTenant, tenantSlugFromHost, type GetOrganizationFilters } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parsePaginationParams, isoDate } from "./utils.js";
import { requireAuth } from "../middleware/requireAuth.js";

function parseOrganizationQuery(req: Request): {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  filters: GetOrganizationFilters;
} {
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

export const organizationRouter: import('express').Router = Router();

organizationRouter.get(
  "/organization",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder, filters } = parseOrganizationQuery(req);
    const slug = tenantSlugFromHost(req.hostname);
    const { rows, total } = await withTenant(slug, (client) =>
      getOrganizationPaginated(client, filters, page, limit, sortBy, sortOrder)
    );
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type ?? "",
      identifiers: r.identifiers ?? {},
      region: r.region,
      territory_id: r.territory_id ?? null,
      status: r.status,
      created_at: isoDate(r.created_at),
      updated_at: isoDate(r.updated_at),
    }));
    res.json({ items, total });
  })
);

organizationRouter.get(
  "/organization/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing organization id" }); return; }
    const slug = tenantSlugFromHost(req.hostname);
    const org = await withTenant(slug, (client) => getOrganizationById(client, id));
    if (!org) { res.status(404).json({ error: "Organization not found" }); return; }
    res.json({
      id: org.id,
      name: org.name,
      type: org.type ?? "",
      identifiers: org.identifiers ?? {},
      region: org.region,
      territory_id: org.territory_id ?? null,
      status: org.status,
      metadata: org.metadata ?? null,
      created_at: isoDate(org.created_at),
      updated_at: isoDate(org.updated_at),
    });
  })
);
