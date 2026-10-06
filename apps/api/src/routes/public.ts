import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  publicLeadLimiter,
  publicSpecialistsLimiter,
  publicQuestionnaireReadLimiter,
  publicQuestionnaireSubmitLimiter,
  publicAppointmentReadLimiter,
  publicAppointmentWriteLimiter,
} from "../middleware/rateLimiter.js";
import type { RequestWithId } from "../middleware/requestId.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { GetPublicLeadInfoQuery } from "../queries/lead.js";
import { GetPublicSpecialistsQuery } from "../queries/organization.js";
import {
  GetPublicQuestionnaireQuery,
  SubmitPublicQuestionnaireCommand,
  MarkPublicQuestionnaireOpenedCommand,
} from "../commands/questionnaireRequest.js";
import {
  GetPublicAppointmentQuery,
  RespondPublicAppointmentCommand,
  OptOutPublicAppointmentCommand,
  type PublicAppointmentMeta,
} from "../commands/appointmentPatient.js";
import { DownloadPublicDocumentCommand } from "../commands/historiaClinicaEmail.js";
import { ValidationError } from "../errors.js";
import { routeParam } from "./utils.js";

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
    const id = routeParam(req, "id")?.trim();
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

    // Public, non-personal directory data (NEO-79): let browsers and shared
    // caches keep it briefly instead of the global /api/v1 "no-store, private"
    // default (server.ts), which exists for per-credential responses. Five
    // minutes bounds how long a clinic an admin just hid can still show up;
    // the rate limiter above stays as the abuse guard.
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
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

/**
 * "The patient opened the link" — sent by an inline script in the PWA's
 * index.html before the app bundle loads (NEO-123). The body is the raw
 * token as text/plain: a CORS "simple request", so the browser skips the
 * preflight round trip. Always 204, whatever the token.
 */
publicRouter.post(
  "/public/questionnaire/opened",
  publicQuestionnaireReadLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const token = typeof req.body === "string" ? req.body.trim() : bodyToken(req);
    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, (client) => MarkPublicQuestionnaireOpenedCommand(client, token));
    res.status(204).end();
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
        tenantSlug: slug,
        requestId: requestId && UUID_RE.test(requestId) ? requestId : null,
      }
    );
    res.status(201).json(result);
  })
);

/**
 * The patient's signed Historia clínica (apps/pwa /d#<token>, NEO-258), opened
 * from the emailed link. Token in the body like the questionnaire's; any
 * unusable link → 410 {code:"LINK_INVALID"}.
 */
publicRouter.post(
  "/public/document",
  publicQuestionnaireReadLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const document = await withTenant(slug, (client) => DownloadPublicDocumentCommand(client, bodyToken(req)));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${document.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
    res.send(Buffer.from(document.bytes));
  })
);

/**
 * The patient's appointment page (apps/pwa /a#<token>, CORE-25), opened from
 * the appointment email. Same rules as the questionnaire link: the token
 * travels in the POST body, any unusable link → 410 {code:"LINK_INVALID"}.
 */
function publicAppointmentMeta(req: Request): PublicAppointmentMeta {
  const requestId = (req as RequestWithId).requestId;
  return {
    ip: req.ip ?? null,
    userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
    requestId: requestId && UUID_RE.test(requestId) ? requestId : null,
  };
}

publicRouter.post(
  "/public/appointment/lookup",
  publicAppointmentReadLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    res.json(await withTenant(slug, (client) => GetPublicAppointmentQuery(client, bodyToken(req))));
  })
);

publicRouter.post(
  "/public/appointment/respond",
  publicAppointmentWriteLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { response?: unknown; note?: unknown } | undefined;
    const response = typeof body?.response === "string" ? body.response : "";
    const note = typeof body?.note === "string" ? body.note : undefined;
    const slug = tenantSlugFromHost(req.hostname);
    res.json(await withTenant(slug, (client) => RespondPublicAppointmentCommand(client, bodyToken(req), response, publicAppointmentMeta(req), note)));
  })
);

publicRouter.post(
  "/public/appointment/opt-out",
  publicAppointmentWriteLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    res.json(await withTenant(slug, (client) => OptOutPublicAppointmentCommand(client, bodyToken(req), publicAppointmentMeta(req))));
  })
);
