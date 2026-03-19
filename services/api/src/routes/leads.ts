import { Router, type Request, type Response } from "express";
import { getLeadsPaginated, getLeadById, insertLead, updateLead, insertAuditLog, type GetLeadsFilters } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parsePaginationParams, toFilterArray, isoDate, requireDb } from "./utils.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseLeadsQuery(req: Request): { page: number; limit: number; sortBy: string; sortOrder: "asc" | "desc"; filters: GetLeadsFilters } {
  const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const session = req.session as { user?: { role?: string } } | undefined;
  return {
    page, limit, sortBy, sortOrder,
    filters: {
      search: search || undefined,
      status: toFilterArray(req.query.status),
      region: toFilterArray(req.query.region),
      hideCompletedOlderThan24h: session?.user?.role !== "admin",
    },
  };
}

function serializeLead(r: { id: string; name: string; email?: string | null; status: string; region: string; created_at: Date | string; institution?: string | null }) {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    status: r.status,
    region: r.region,
    created_at: isoDate(r.created_at),
    institution: r.institution ?? undefined,
  };
}

export const leadsRouter = Router();

leadsRouter.get(
  "/api/leads",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder, filters } = parseLeadsQuery(req);
    const { rows, total } = await getLeadsPaginated(filters, page, limit, sortBy, sortOrder);
    res.json({ items: rows.map(serializeLead), total });
  })
);

leadsRouter.get(
  "/api/leads/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing lead id" }); return; }
    const lead = await getLeadById(id);
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    res.json(serializeLead(lead));
  })
);

leadsRouter.post(
  "/api/leads",
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { name?: string; email?: string; status?: string; region?: string; institution?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    if (email && !EMAIL_REGEX.test(email)) { res.status(400).json({ error: "Invalid email format" }); return; }
    if (!requireDb(res)) return;
    const lead = await insertLead({
      name,
      email,
      status: typeof body.status === "string" ? body.status : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
    });
    if (!lead) { res.status(500).json({ error: "Failed to create lead" }); return; }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    await insertAuditLog({ user_id: userId, action: "lead_created", entity_type: "lead", entity_id: lead.id, metadata: { name: lead.name, status: lead.status, region: lead.region } });
    res.status(201).json(serializeLead(lead));
  })
);

leadsRouter.patch(
  "/api/leads/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing lead id" }); return; }
    const body = req.body as { name?: string; email?: string; status?: string; region?: string; institution?: string };
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    if (email !== undefined && email !== "" && !EMAIL_REGEX.test(email)) { res.status(400).json({ error: "Invalid email format" }); return; }
    if (!requireDb(res)) return;
    const lead = await updateLead(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      email: body.email !== undefined ? body.email : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
    });
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    await insertAuditLog({ user_id: userId, action: "lead_updated", entity_type: "lead", entity_id: lead.id, metadata: { name: lead.name, status: lead.status, region: lead.region } });
    res.json(serializeLead(lead));
  })
);
