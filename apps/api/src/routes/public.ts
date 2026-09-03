import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { publicLeadLimiter, publicSpecialistsLimiter } from "../middleware/rateLimiter.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { GetPublicLeadInfoQuery } from "../queries/lead.js";
import { GetPublicSpecialistsQuery } from "../queries/organization.js";
import { ValidationError } from "../errors.js";

/**
 * Public, unauthenticated read-only endpoints for the marketing site
 * (apps/web) — no session/TenantContext, see commands/lead.ts's
 * UpsertPublicLeadCommand for why.
 */
export const publicRouter: import("express").Router = Router();

publicRouter.get(
  "/public/lead/:id",
  publicLeadLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) throw new ValidationError("Missing lead id");

    const slug = tenantSlugFromHost(req.hostname);
    const lead = await withTenant(slug, async (client) => GetPublicLeadInfoQuery(client, id));

    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    res.json(lead);
  })
);

publicRouter.get(
  "/public/specialists",
  publicSpecialistsLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const slug = tenantSlugFromHost(req.hostname);
    const specialists = await withTenant(slug, async (client) => GetPublicSpecialistsQuery(client, search));

    res.json({ specialists });
  })
);
