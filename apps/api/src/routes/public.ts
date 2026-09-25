import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  publicLeadLimiter,
  publicSpecialistsLimiter,
  publicQuestionnaireReadLimiter,
  publicQuestionnaireSubmitLimiter,
} from "../middleware/rateLimiter.js";
import type { RequestWithId } from "../middleware/requestId.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { GetPublicLeadInfoQuery } from "../queries/lead.js";
import { GetPublicSpecialistsQuery } from "../queries/organization.js";
import { GetPublicQuestionnaireQuery, SubmitPublicQuestionnaireCommand } from "../commands/questionnaireRequest.js";
import { ValidationError } from "../errors.js";

/**
 * Public, unauthenticated endpoints — no session/TenantContext, see
 * commands/lead.ts's UpsertPublicLeadCommand for why. Lead/specialist reads
 * serve the marketing site (apps/web); the questionnaire pair serves the
 * patient self-fill page (apps/pwa /q#<token>).
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

/**
 * Patient self-fill questionnaire, opened from the QR code a doctor shows.
 * The token is the only credential (commands/questionnaireRequest.ts), so
 * it travels in the POST body, never in a URL: paths end up in Render's
 * request logs, the page's own URL carries it only in the #fragment (which
 * browsers never send anywhere). Any unusable link → 410
 * {code:"LINK_INVALID"}, the same for unknown, used, cancelled or expired.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bodyToken(req: Request): string {
  const token = (req.body as { token?: unknown } | undefined)?.token;
  return typeof token === "string" ? token.trim() : "";
}

publicRouter.post(
  "/public/questionnaire/lookup",
  publicQuestionnaireReadLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const locale = (req.body as { locale?: unknown } | undefined)?.locale;
    const questionnaire = await withTenant(slug, async (client) => GetPublicQuestionnaireQuery(client, bodyToken(req), locale));
    res.json(questionnaire);
  })
);

publicRouter.post(
  "/public/questionnaire/submit",
  publicQuestionnaireSubmitLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    // X-Request-ID is client-controlled; on an unauthenticated route it only
    // reaches the audit row if it has the shape our own middleware generates.
    const requestId = (req as RequestWithId).requestId;
    // A runner, not one withTenant: signing a consent renders a PDF between
    // two short transactions (see SubmitPublicQuestionnaireCommand).
    const result = await SubmitPublicQuestionnaireCommand(
      (fn) => withTenant(slug, fn),
      bodyToken(req),
      (req.body ?? {}) as Record<string, unknown>,
      {
        ip: req.ip ?? null,
        userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
        requestId: requestId && UUID_RE.test(requestId) ? requestId : null,
      }
    );
    res.status(201).json(result);
  })
);
