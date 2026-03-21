import { Router, type Request, type Response } from "express";
import { getHCPPaginated, getHCPById, insertHCP, updateHCP, insertAuditLog, type GetHCPFilters } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parsePaginationParams, toFilterArray, isoDate } from "./utils.js";
import { requireAuth } from "../middleware/requireAuth.js";

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

function serializeHCP(r: {
  id: string;
  first_name: string;
  last_name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  institution?: string | null;
  region: string;
  influence_tier?: string;
  engagement_level?: string;
  prescribing_volume?: string | null;
  is_key_opinion_leader?: boolean;
  visit_count?: number;
  status?: string;
  tags?: string[];
  created_at: Date | string;
}) {
  return {
    id: r.id,
    // Legacy name field for backward compat with existing Vue components
    name: `${r.title ? r.title + " " : ""}${r.first_name} ${r.last_name}`.trim(),
    first_name: r.first_name,
    last_name: r.last_name,
    title: r.title ?? null,
    email: r.email ?? "",
    phone: r.phone ?? "",
    // Legacy specialty field for backward compat
    specialty: r.primary_specialty ?? "",
    primary_specialty: r.primary_specialty ?? "",
    institution: r.institution ?? "",
    region: r.region,
    influence_tier: r.influence_tier ?? "C",
    engagement_level: r.engagement_level ?? "unknown",
    prescribing_volume: r.prescribing_volume ?? null,
    is_key_opinion_leader: r.is_key_opinion_leader ?? false,
    visit_count: r.visit_count ?? 0,
    status: r.status ?? "active",
    tags: r.tags ?? [],
    created_at: isoDate(r.created_at),
  };
}

export const hcpRouter = Router();

hcpRouter.get(
  "/api/hcp",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder, filters } = parseHCPQuery(req);
    const { rows, total } = await getHCPPaginated(filters, page, limit, sortBy, sortOrder);
    res.json({ items: rows.map(serializeHCP), total });
  })
);

hcpRouter.get(
  "/api/hcp/:id",
  requireAuth,
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
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      first_name?: string; last_name?: string; title?: string;
      email?: string; phone?: string; primary_specialty?: string;
      specialty?: string;  // legacy alias
      institution?: string; region?: string; lead_id?: string;
      influence_tier?: string; engagement_level?: string;
    };
    const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
    const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!firstName) { res.status(400).json({ error: "first_name is required" }); return; }
    if (!lastName) { res.status(400).json({ error: "last_name is required" }); return; }
    if (email && !EMAIL_REGEX.test(email)) { res.status(400).json({ error: "Invalid email format" }); return; }
    if (phone) {
      const digitsOnly = phone.replace(/\D/g, "");
      if (digitsOnly.length < 9) { res.status(400).json({ error: "Phone must contain at least 9 digits" }); return; }
    }
    if (!requireDb(res)) return;
    const hcp = await insertHCP({
      first_name: firstName,
      last_name: lastName,
      title: typeof body.title === "string" ? body.title : null,
      email: email || null,
      phone: phone || null,
      primary_specialty: typeof body.primary_specialty === "string" ? body.primary_specialty
        : typeof body.specialty === "string" ? body.specialty : null,
      institution: typeof body.institution === "string" ? body.institution : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      lead_id: typeof body.lead_id === "string" ? body.lead_id.trim() || undefined : undefined,
      influence_tier: typeof body.influence_tier === "string" ? body.influence_tier : undefined,
      engagement_level: typeof body.engagement_level === "string" ? body.engagement_level : undefined,
    });
    if (!hcp) { res.status(500).json({ error: "Failed to create contact" }); return; }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    const fullName = `${firstName} ${lastName}`;
    await insertAuditLog({ user_id: userId, action: "hcp_created", entity_type: "hcp", entity_id: hcp.id, metadata: { name: fullName, email, institution: hcp.institution ?? undefined } });
    res.status(201).json(serializeHCP(hcp));
  })
);

hcpRouter.patch(
  "/api/hcp/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing HCP id" }); return; }
    const body = req.body as {
      first_name?: string; last_name?: string; title?: string;
      email?: string; phone?: string; primary_specialty?: string;
      specialty?: string;  // legacy alias
      institution?: string; region?: string;
      influence_tier?: string; engagement_level?: string;
      prescribing_volume?: string; preferred_contact?: string;
      preferred_time?: string; language?: string; notes?: string;
      tags?: string[];
    };
    if (body.email && !EMAIL_REGEX.test(body.email)) { res.status(400).json({ error: "Invalid email format" }); return; }
    if (body.phone) {
      const digitsOnly = body.phone.replace(/\D/g, "");
      if (digitsOnly.length < 9) { res.status(400).json({ error: "Phone must contain at least 9 digits" }); return; }
    }
    if (!requireDb(res)) return;
    const hcp = await updateHCP(id, {
      first_name: typeof body.first_name === "string" ? body.first_name : undefined,
      last_name: typeof body.last_name === "string" ? body.last_name : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      primary_specialty: typeof body.primary_specialty === "string" ? body.primary_specialty
        : typeof body.specialty === "string" ? body.specialty : undefined,
      institution: typeof body.institution === "string" ? body.institution : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      influence_tier: typeof body.influence_tier === "string" ? body.influence_tier : undefined,
      engagement_level: typeof body.engagement_level === "string" ? body.engagement_level : undefined,
      prescribing_volume: typeof body.prescribing_volume === "string" ? body.prescribing_volume : undefined,
      preferred_contact: typeof body.preferred_contact === "string" ? body.preferred_contact : undefined,
      preferred_time: typeof body.preferred_time === "string" ? body.preferred_time : undefined,
      language: typeof body.language === "string" ? body.language : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
    });
    if (!hcp) { res.status(404).json({ error: "Contact not found" }); return; }
    const userId = (req.session as { user?: { id: string } })?.user?.id;
    const fullName = `${hcp.first_name} ${hcp.last_name}`;
    await insertAuditLog({ user_id: userId, action: "hcp_updated", entity_type: "hcp", entity_id: hcp.id, metadata: { name: fullName, email: hcp.email ?? undefined, institution: hcp.institution ?? undefined } });
    res.json(serializeHCP(hcp));
  })
);

