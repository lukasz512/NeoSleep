import { Router, type Router as RouterType } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { searchLimiter } from "../middleware/rateLimiter.js";
import { insertAuditLog, tenantSlugFromHost, withTenant } from "../db.js";
import { ValidationError } from "../errors.js";
import { buildContext } from "../context/TenantContext.js";
import { GetPatientListQuery } from "../queries/patient.js";
import { GetPractitionerListQuery } from "../queries/practitioner.js";
import { GetOrganizationListQuery } from "../queries/organization.js";

/**
 * Global search (CORE-292). Reuses the list queries, so each role sees exactly what it sees
 * on the list endpoints. The term goes in the body (never in a URL or access log) and is
 * NOT stored in the audit trail (length and counts only).
 */

export const MIN_TERM_CHARS = 2;
export const MAX_TERM_CHARS = 100;
const PER_GROUP = 5;

export interface SearchHit {
  id: string;
  label: string;
  sublabel: string;
  region: string;
}

export const searchRouter: RouterType = Router();

searchRouter.post(
  "/search",
  requireAuth,
  searchLimiter,
  asyncHandler(async (req, res) => {
    const raw: unknown = req.body?.term;
    if (typeof raw !== "string") throw new ValidationError("term is required");
    const term = raw.trim();
    if (term.length < MIN_TERM_CHARS || term.length > MAX_TERM_CHARS) {
      throw new ValidationError(`term must be ${MIN_TERM_CHARS}-${MAX_TERM_CHARS} characters`);
    }

    const slug = tenantSlugFromHost(req.hostname);
    const page = { search: term, page: 1, limit: PER_GROUP };

    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      // Sequential: one pg client can't run queries concurrently.
      const patients = await GetPatientListQuery(ctx, page);
      const practitioners = await GetPractitionerListQuery(ctx, page);
      const organizations = await GetOrganizationListQuery(ctx, page);
      const out = {
        patients: patients.items.map(
          (p): SearchHit => ({ id: p.id, label: p.name, sublabel: typeof p.diagnosis_code === "string" ? p.diagnosis_code : "", region: p.region })
        ),
        practitioners: practitioners.items.map(
          (p): SearchHit => ({ id: p.id, label: p.name, sublabel: p.primary_specialty ?? "", region: p.region })
        ),
        organizations: organizations.items.map(
          (o): SearchHit => ({ id: o.id, label: o.name, sublabel: o.city, region: o.region })
        ),
      };
      await insertAuditLog(client, {
        user_id: req.user!.sub,
        action: "search",
        entity_type: "Search",
        outcome: "success",
        metadata: {
          term_chars: term.length,
          counts: {
            patients: out.patients.length,
            practitioners: out.practitioners.length,
            organizations: out.organizations.length,
          },
        },
        user_ip: req.ip,
        user_agent: req.get("user-agent") ?? null,
      });
      return out;
    });

    res.set("Cache-Control", "no-store");
    res.json(result);
  })
);
