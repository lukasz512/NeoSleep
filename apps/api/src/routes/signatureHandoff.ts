import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { signatureHandoffLimiter } from "../middleware/rateLimiter.js";
import type { RequestWithId } from "../middleware/requestId.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import {
  StartDoctorSignHandoffCommand,
  GetSignatureHandoffForPhoneQuery,
  SignSignatureHandoffCommand,
  PickUpSignatureHandoffCommand,
} from "../commands/signatureHandoff.js";
import { StartPatientSignHandoffCommand } from "../commands/questionnaireRequest.js";

/**
 * "Sign on your phone" (CORE-172) — the QR next to every signature pad on a
 * computer. Starting needs the pad owner's own credential (session here,
 * questionnaire token here, invite token in routes/invite.ts); the phone and
 * the pickup need only the token they were given. Tokens always travel in
 * POST bodies, never in URLs (request logs), like the /q routes.
 */
export const signatureHandoffRouter: RouterType = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPIRED_QR = { error: "This QR code has expired. Show a new one on the computer." };

function bodyString(req: Request, key: string): string {
  const value = (req.body as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" ? value : "";
}

// Doctor signing before printing the Historia clínica (NEO-255).
signatureHandoffRouter.post(
  "/signature-handoff",
  requireAuth,
  signatureHandoffLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const started = await withTenant(slug, async (client) => StartDoctorSignHandoffCommand(await buildContext(req, client, slug)));
    res.set("Cache-Control", "no-store");
    res.json(started);
  })
);

// Patient consent on /q opened on a computer. An unusable link → 410, like the other /q routes.
signatureHandoffRouter.post(
  "/public/questionnaire/sign-handoff",
  signatureHandoffLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const started = await withTenant(slug, (client) => StartPatientSignHandoffCommand(client, bodyString(req, "token").trim()));
    res.set("Cache-Control", "no-store");
    res.json(started);
  })
);

signatureHandoffRouter.post(
  "/public/signature-handoff/lookup",
  signatureHandoffLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const view = await withTenant(slug, (client) => GetSignatureHandoffForPhoneQuery(client, bodyString(req, "h")));
    if (!view) {
      res.status(404).json(EXPIRED_QR);
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json(view);
  })
);

signatureHandoffRouter.post(
  "/public/signature-handoff/sign",
  signatureHandoffLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    // X-Request-ID is client-controlled; on a public route it only reaches the audit row in our own shape.
    const requestId = (req as RequestWithId).requestId;
    const stored = await withTenant(slug, (client) =>
      SignSignatureHandoffCommand(
        client,
        { handoffToken: bodyString(req, "h"), signatureDataUrl: bodyString(req, "signatureDataUrl") },
        {
          requestId: requestId && UUID_RE.test(requestId) ? requestId : null,
          ip: req.ip ?? null,
          userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
        }
      )
    );
    if (!stored) {
      res.status(404).json(EXPIRED_QR);
      return;
    }
    res.json({ success: true });
  })
);

signatureHandoffRouter.post(
  "/public/signature-handoff/pickup",
  signatureHandoffLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, (client) => PickUpSignatureHandoffCommand(client, bodyString(req, "p")));
    res.set("Cache-Control", "no-store");
    res.json(result);
  })
);
