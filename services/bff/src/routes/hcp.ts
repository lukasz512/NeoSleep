import { Router, type Request, type Response } from "express";
import { getPool, getHCPPaginated, getHCPById, insertHCP, updateHCP, insertAuditLog, type GetHCPFilters } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function parseHCPQuery(req: Request): {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  filters: GetHCPFilters;
} {
  const page = Math.max(1, parseInt(String(req.query.page), 10) || DEFAULT_PAGE);
  const rawLimit = parseInt(String(req.query.limit), 10);
  const limit = rawLimit === -1 || rawLimit <= 0 ? MAX_LIMIT : Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy.trim() || "created_at" : "created_at";
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const specialty = toFilterArray(req.query.specialty);
  const institution = toFilterArray(req.query.institution);
  const region = toFilterArray(req.query.region);
  return {
    page,
    limit,
    sortBy,
    sortOrder,
    filters: { search: search || undefined, specialty, institution, region },
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toFilterArray(q: unknown): string[] | undefined {
  if (q === undefined || q === null) return undefined;
  if (Array.isArray(q)) {
    const arr = q.map((v) => String(v).trim()).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }
  const s = String(q).trim();
  return s ? [s] : undefined;
}

export const hcpRouter = Router();

hcpRouter.get(
  "/api/hcp",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder, filters } = parseHCPQuery(req);
    const { rows, total } = await getHCPPaginated(filters, page, limit, sortBy, sortOrder);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email ?? "",
      specialty: r.specialty ?? "",
      institution: r.institution ?? "",
      region: r.region,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
    res.json({ items, total });
  })
);

hcpRouter.get(
  "/api/hcp/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing HCP id" });
      return;
    }
    const hcp = await getHCPById(id);
    if (!hcp) {
      res.status(404).json({ error: "HCP not found" });
      return;
    }
    res.json({
      id: hcp.id,
      name: hcp.name,
      email: hcp.email ?? "",
      phone: hcp.phone ?? "",
      specialty: hcp.specialty ?? "",
      institution: hcp.institution ?? "",
      region: hcp.region,
      created_at: hcp.created_at instanceof Date ? hcp.created_at.toISOString() : hcp.created_at,
    });
  })
);

hcpRouter.post(
  "/api/hcp",
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      specialty?: string;
      institution?: string;
      region?: string;
      lead_id?: string;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    if (!getPool()) {
      res.status(503).json({
        error: "Database not available. Ensure Postgres is running and DATABASE_URL is set.",
      });
      return;
    }
    if (!phone) {
      res.status(400).json({ error: "Phone is required" });
      return;
    }
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 10) {
      res.status(400).json({ error: "Phone must contain at least 10 digits" });
      return;
    }
    /** MX country code. Configurable per country later. */
    const phoneWithCountryCode = `+52${digitsOnly}`;
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() || undefined : undefined;
    const hcp = await insertHCP({
      name,
      email,
      phone: phoneWithCountryCode,
      specialty: typeof body.specialty === "string" ? body.specialty : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      lead_id: leadId,
    });
    if (!hcp) {
      res.status(500).json({ error: "Failed to create contact" });
      return;
    }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    await insertAuditLog({
      user_id: userId,
      action: "hcp_created",
      entity_type: "hcp",
      entity_id: hcp.id,
      metadata: { name: hcp.name, email, institution: hcp.institution ?? undefined },
    });
    res.status(201).json({
      id: hcp.id,
      name: hcp.name,
      email: hcp.email ?? "",
      specialty: hcp.specialty ?? "",
      institution: hcp.institution ?? "",
      region: hcp.region,
      created_at: hcp.created_at instanceof Date ? hcp.created_at.toISOString() : hcp.created_at,
    });
  })
);

hcpRouter.patch(
  "/api/hcp/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing HCP id" });
      return;
    }
    const body = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      specialty?: string;
      institution?: string;
      region?: string;
    };
    if (body.email && !EMAIL_REGEX.test(body.email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    if (body.phone) {
      const digitsOnly = body.phone.replace(/\D/g, "");
      if (digitsOnly.length < 10) {
        res.status(400).json({ error: "Phone must contain at least 10 digits" });
        return;
      }
    }
    if (!getPool()) {
      res.status(503).json({
        error: "Database not available. Ensure Postgres is running and DATABASE_URL is set.",
      });
      return;
    }
    const hcp = await updateHCP(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      specialty: typeof body.specialty === "string" ? body.specialty : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
    });
    if (!hcp) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    await insertAuditLog({
      user_id: userId,
      action: "hcp_updated",
      entity_type: "hcp",
      entity_id: hcp.id,
      metadata: { name: hcp.name, email: hcp.email ?? undefined, institution: hcp.institution ?? undefined },
    });
    res.json({
      id: hcp.id,
      name: hcp.name,
      email: hcp.email ?? "",
      specialty: hcp.specialty ?? "",
      institution: hcp.institution ?? "",
      region: hcp.region,
      created_at: hcp.created_at instanceof Date ? hcp.created_at.toISOString() : hcp.created_at,
    });
  })
);
