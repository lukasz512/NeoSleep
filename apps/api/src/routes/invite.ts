import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { inviteAcceptLimiter } from "../middleware/rateLimiter.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { ValidateInviteTokenQuery, AcceptPractitionerInviteCommand } from "../commands/invitePractitioner.js";
import type { RequestWithId } from "../middleware/requestId.js";

/**
 * Public invite routes — no session required. The invitee has no account to
 * authenticate with until AcceptPractitionerInviteCommand runs, so these
 * bypass requireAuth/requireRole entirely (same as auth.ts's forgot/reset-password).
 */

export const inviteRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/invite/validate?token= — check invite validity, prefill name/email
// ---------------------------------------------------------------------------
inviteRouter.get(
  "/invite/validate",
  asyncHandler(async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const slug = tenantSlugFromHost(req.hostname);
    const preview = await withTenant(slug, (client) => ValidateInviteTokenQuery(client, token));
    if (!preview) {
      res.status(404).json({ error: "Invalid or expired invitation link." });
      return;
    }
    res.json(preview);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/invite/accept — set password, capture clinic/invoice data, sign documents
// ---------------------------------------------------------------------------
inviteRouter.post(
  "/invite/accept",
  inviteAcceptLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      token?: string;
      password?: string;
      clinicName?: string;
      taxId?: string;
      billingAddress?: string;
      gdprAccepted?: boolean;
      agreementAccepted?: boolean;
      signatureDataUrl?: string;
    };

    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      await AcceptPractitionerInviteCommand(
        client,
        {
          token: typeof body.token === "string" ? body.token : "",
          password: typeof body.password === "string" ? body.password : "",
          clinicName: typeof body.clinicName === "string" ? body.clinicName : "",
          taxId: typeof body.taxId === "string" ? body.taxId : "",
          billingAddress: typeof body.billingAddress === "string" ? body.billingAddress : "",
          gdprAccepted: body.gdprAccepted === true,
          agreementAccepted: body.agreementAccepted === true,
          signatureDataUrl: typeof body.signatureDataUrl === "string" ? body.signatureDataUrl : "",
        },
        {
          requestId: (req as RequestWithId).requestId,
          ip: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        }
      );
    });

    res.json({ success: true });
  })
);
