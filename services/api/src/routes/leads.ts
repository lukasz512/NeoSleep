import { Router, type Request, type Response } from "express";
import { getDb, getLeadsPaginated, getLeadById, insertLead, updateLead, insertAuditLog, type GetLeadsFilters } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function parseLeadsQuery(req: Request): {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  filters: GetLeadsFilters;
} {
  const page = Math.max(1, parseInt(String(req.query.page), 10) || DEFAULT_PAGE);
  const rawLimit = parseInt(String(req.query.limit), 10);
  const limit = rawLimit === -1 || rawLimit <= 0 ? MAX_LIMIT : Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy.trim() || "created_at" : "created_at";
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const status = toFilterArray(req.query.status);
  const region = toFilterArray(req.query.region);
  const session = req.session as { user?: { role?: string } } | undefined;
  const isRep = session?.user?.role !== "admin";
  return {
    page,
    limit,
    sortBy,
    sortOrder,
    filters: {
      search: search || undefined,
      status,
      region,
      hideCompletedOlderThan24h: isRep,
    },
  };
}

function toFilterArray(q: unknown): string[] | undefined {
  if (q === undefined || q === null) return undefined;
  if (Array.isArray(q)) {
    const arr = q.map((v) => String(v).trim()).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }
  const s = String(q).trim();
  return s ? [s] : undefined;
}

export const leadsRouter = Router();

leadsRouter.get(
  "/api/leads",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder, filters } = parseLeadsQuery(req);
    const { rows, total } = await getLeadsPaginated(filters, page, limit, sortBy, sortOrder);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email ?? "",
      status: r.status,
      region: r.region,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      institution: r.institution ?? undefined,
    }));
    res.json({ items, total });
  })
);

leadsRouter.get(
  "/api/leads/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing lead id" });
      return;
    }
    const lead = await getLeadById(id);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json({
      id: lead.id,
      name: lead.name,
      email: lead.email ?? "",
      status: lead.status,
      region: lead.region,
      created_at: lead.created_at instanceof Date ? lead.created_at.toISOString() : lead.created_at,
      institution: lead.institution ?? undefined,
    });
  })
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

leadsRouter.post(
  "/api/leads",
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { name?: string; email?: string; status?: string; region?: string; institution?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    if (email && !EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    if (!getDb()) {
      res.status(503).json({
        error: "Database not available. Ensure Postgres is running and DATABASE_URL is set.",
      });
      return;
    }
    const lead = await insertLead({
      name,
      email,
      status: typeof body.status === "string" ? body.status : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
    });
    if (!lead) {
      res.status(500).json({ error: "Failed to create lead" });
      return;
    }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    await insertAuditLog({
      user_id: userId,
      action: "lead_created",
      entity_type: "lead",
      entity_id: lead.id,
      metadata: { name: lead.name, status: lead.status, region: lead.region },
    });
    res.status(201).json({
      id: lead.id,
      name: lead.name,
      email: lead.email ?? "",
      status: lead.status,
      region: lead.region,
      created_at: lead.created_at instanceof Date ? lead.created_at.toISOString() : lead.created_at,
      institution: lead.institution ?? undefined,
    });
  })
);

leadsRouter.patch(
  "/api/leads/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing lead id" });
      return;
    }
    const body = req.body as { name?: string; email?: string; status?: string; region?: string; institution?: string };
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    if (email !== undefined && email !== "" && !EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    if (!getDb()) {
      res.status(503).json({
        error: "Database not available. Ensure Postgres is running and DATABASE_URL is set.",
      });
      return;
    }
    const lead = await updateLead(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      email: body.email !== undefined ? body.email : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
    });
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    await insertAuditLog({
      user_id: userId,
      action: "lead_updated",
      entity_type: "lead",
      entity_id: lead.id,
      metadata: { name: lead.name, status: lead.status, region: lead.region },
    });
    res.json({
      id: lead.id,
      name: lead.name,
      email: lead.email ?? "",
      status: lead.status,
      region: lead.region,
      created_at: lead.created_at instanceof Date ? lead.created_at.toISOString() : lead.created_at,
      institution: lead.institution ?? undefined,
    });
  })
);
