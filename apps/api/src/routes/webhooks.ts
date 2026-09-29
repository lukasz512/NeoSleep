import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { verifyResendWebhook, ResendWebhookNotConfiguredError } from "../mailer.js";
import { ApplyResendEventCommand } from "../commands/emailDelivery.js";

/**
 * Machine-to-machine callbacks from outside services — no session. Each one
 * authenticates by its provider's signature instead (NEO-190).
 *
 * POST /webhooks/resend — Resend reports what happened to an email
 * (delivered, bounced, spam …). The signature covers the exact bytes Resend
 * sent, so server.ts mounts express.raw() for this path before the global
 * JSON parser. Any verified event gets 200 even when it matches no row, so
 * Resend doesn't retry emails that were never patient emails.
 */
export const webhooksRouter: import("express").Router = Router();

webhooksRouter.post(
  "/webhooks/resend",
  asyncHandler(async (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const headers = {
      id: req.get("svix-id") ?? "",
      timestamp: req.get("svix-timestamp") ?? "",
      signature: req.get("svix-signature") ?? "",
    };

    let event: ReturnType<typeof verifyResendWebhook>;
    try {
      event = verifyResendWebhook(raw, headers);
    } catch (err) {
      if (err instanceof ResendWebhookNotConfiguredError) {
        res.status(503).json({ error: "Webhook not configured" });
        return;
      }
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    const outcome = await ApplyResendEventCommand(event);
    res.status(200).json({ outcome });
  })
);
