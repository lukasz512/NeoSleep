import { Router, type Request, type Response } from "express";
import { getHCPPaginated, getHCPById, insertHCP, updateHCP, insertAuditLog, type GetHCPFilters } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parsePaginationParams, toFilterArray, isoDate, requireDb } from "./utils.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseHCPQuery(req: Request): { page: number; limit: number; sortBy: string; sortOrder: "asc" | "desc"; filters: GetHCPFilters } {
  const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  return {
    page, limit, sortBy, sortOrder,
    filters: {
      search: search || undefined,
      specialty: toFilterArray(req.query.specialty),
      institution: toFilterArray(req.query.institution),
      region: toFilterArray(req.query.region),
    },
  };
}

function serializeHCP(r: { id: string; name: string; email?: string | null; phone?: string | null; specialty?: string | null; institution?: string | null; region: string; created_at: Date | string }) {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    phone: r.phone ?? "",
    specialty: r.specialty ?? "",
    institution: r.institution ?? "",
    region: r.region,
    created_at: isoDate(r.created_at),
  };
}

export const hcpRouter = Router();

hcpRouter.get(
  "/api/hcp",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder, filters } = parseHCPQuery(req);
    const { rows, total } = await getHCPPaginated(filters, page, limit, sortBy, sortOrder);
    res.json({ items: rows.map(serializeHCP), total });
  })
);

hcpRouter.get(
  "/api/hcp/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing HCP id" }); return; }
    const hcp = await getHCPById(id);
    if (!hcp) { res.status(404).json({ error: "HCP not found" }); return; }
    res.json(serializeHCP(hcp));
  })
);

hcpRouter.post(
  "/api/hcp",
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { name?: string; email?: string; phone?: string; specialty?: string; institution?: string; region?: string; lead_id?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    if (!email) { res.status(400).json({ error: "Email is required" }); return; }
    if (!EMAIL_REGEX.test(email)) { res.status(400).json({ error: "Invalid email format" }); return; }
    if (!phone) { res.status(400).json({ error: "Phone is required" }); return; }
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 10) { res.status(400).json({ error: "Phone must contain at least 10 digits" }); return; }
    if (!requireDb(res)) return;
    /** MX country code. Configurable per country later. */
    const hcp = await insertHCP({
      name,
      email,
      phone: `+52${digitsOnly}`,
      specialty: typeof body.specialty === "string" ? body.specialty : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      lead_id: typeof body.lead_id === "string" ? body.lead_id.trim() || undefined : undefined,
    });
    if (!hcp) { res.status(500).json({ error: "Failed to create contact" }); return; }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    await insertAuditLog({ user_id: userId, action: "hcp_created", entity_type: "hcp", entity_id: hcp.id, metadata: { name: hcp.name, email, institution: hcp.institution ?? undefined } });
    res.status(201).json(serializeHCP(hcp));
  })
);

hcpRouter.patch(
  "/api/hcp/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing HCP id" }); return; }
    const body = req.body as { name?: string; email?: string; phone?: string; specialty?: string; institution?: string; region?: string };
    if (body.email && !EMAIL_REGEX.test(body.email)) { res.status(400).json({ error: "Invalid email format" }); return; }
    if (body.phone) {
      const digitsOnly = body.phone.replace(/\D/g, "");
      if (digitsOnly.length < 10) { res.status(400).json({ error: "Phone must contain at least 10 digits" }); return; }
    }
    if (!requireDb(res)) return;
    const hcp = await updateHCP(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      specialty: typeof body.specialty === "string" ? body.specialty : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
    });
    if (!hcp) { res.status(404).json({ error: "Contact not found" }); return; }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    await insertAuditLog({ user_id: userId, action: "hcp_updated", entity_type: "hcp", entity_id: hcp.id, metadata: { name: hcp.name, email: hcp.email ?? undefined, institution: hcp.institution ?? undefined } });
    res.json(serializeHCP(hcp));
  })
);

