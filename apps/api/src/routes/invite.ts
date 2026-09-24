import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { inviteAcceptLimiter, invitePreviewLimiter } from "../middleware/rateLimiter.js";
import { withTenant, tenantSlugFromHost, insertAuditLog } from "../db.js";
import {
  ValidateInviteTokenQuery,
  AcceptPractitionerInviteCommand,
  GetPartnerDocumentPreviewQuery,
} from "../commands/invitePractitioner.js";
import { sendSignedDocumentsEmail } from "../mailer.js";
import type { RequestWithId } from "../middleware/requestId.js";

/**
 * Public invite routes — no session required. The invitee has no account to
 * authenticate with until AcceptPractitionerInviteCommand runs, so these
 * bypass requireAuth/requireRole entirely (same as auth.ts's forgot/reset-password).
 * The invite token IS the credential for all three.
 */

export const inviteRouter: RouterType = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/invite/validate?token= — check invite validity, prefill the form
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
// GET /api/v1/invite/document?token=&type=agreement|notice — the document the
// doctor reads before signing (NEO-51). Includes NeoSleep's signature image,
// so it is token-gated and rate-limited like accept.
// ---------------------------------------------------------------------------
inviteRouter.get(
  "/invite/document",
  invitePreviewLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const kind = req.query.type === "notice" ? "notice" : req.query.type === "agreement" ? "agreement" : null;
    if (!kind) {
      res.status(400).json({ error: "type must be 'agreement' or 'notice'" });
      return;
    }
    const slug = tenantSlugFromHost(req.hostname);
    const preview = await withTenant(slug, (client) => GetPartnerDocumentPreviewQuery(client, token, kind));
    if (!preview) {
      res.status(404).json({ error: "Invalid or expired invitation link." });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json(preview);
  })
);

// ---------------------------------------------------------------------------
// POST /api/v1/invite/accept — set password, confirm details, sign + acknowledge
// ---------------------------------------------------------------------------
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

inviteRouter.post(
  "/invite/accept",
  inviteAcceptLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const requestId = (req as RequestWithId).requestId;

    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, (client) =>
      AcceptPractitionerInviteCommand(
        client,
        {
          token: str(body.token),
          password: str(body.password),
          clinicName: str(body.clinicName),
          clinicEmail: str(body.clinicEmail),
          clinicPhone: str(body.clinicPhone),
          taxId: str(body.taxId),
          billingAddress: str(body.billingAddress),
          licenseNumber: str(body.licenseNumber),
          practiceRole: str(body.practiceRole),
          agreementSignatureDataUrl: str(body.agreementSignatureDataUrl),
          agreementVersionId: str(body.agreementVersionId),
          dpaVersionId: str(body.dpaVersionId),
          noticeVersionId: str(body.noticeVersionId),
          noticeAcknowledged: body.noticeAcknowledged === true,
        },
        {
          requestId,
          ip: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        }
      )
    );

    res.json({ success: true, email: result.email });

    // Deliberately after the transaction has committed (res.json already sent) — a failure here
    // must never roll back or block a signature that already succeeded. Fire-and-forget with its
    // own error handling, same discipline as auth.ts's forgot-password email. The Resend message
    // id is recorded afterwards as part of the signing evidence trail (best effort).
    sendSignedDocumentsEmail(
      result.email,
      { language: result.locale },
      result.documents.map((d) => ({ filename: d.filename, content: Buffer.from(d.bytes) })),
      result.ccEmail
    )
      .then((messageId) =>
        withTenant(slug, (client) =>
          insertAuditLog(client, {
            user_id: result.userId,
            action: "email_signed_documents",
            entity_type: "SignedDocument",
            entity_id: result.userId,
            entity_after: { to: result.email, cc: result.ccEmail, resend_message_id: messageId },
            request_id: requestId,
          })
        )
      )
      .catch((err) => console.error("[invite] Failed to send signed documents email:", err));
  })
);
