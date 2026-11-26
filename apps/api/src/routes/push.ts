/**
 * Web Push routes.
 *
 * POST   /api/push/subscribe   — save a browser push subscription for the current user
 * DELETE /api/push/subscribe   — remove a subscription by endpoint
 *
 * VAPID keys are loaded from env:
 *   VAPID_PUBLIC_KEY   — base64url public key (generated once, committed to .env.example)
 *   VAPID_PRIVATE_KEY  — base64url private key (secret, never committed)
 *   VAPID_SUBJECT      — mailto: or https: contact URL
 *
 * Generate keys once:
 *   node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"
 */
import { Router, type Request, type Response } from "express";
import webpush from "web-push";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getDb } from "../db/connection.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";

export const pushRouter: import('express').Router = Router();

function getVapidConfig() {
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT;
  return { publicKey, privateKey, subject };
}

function isVapidConfigured(): boolean {
  const { publicKey, privateKey } = getVapidConfig();
  return !!publicKey && !!privateKey;
}

if (isVapidConfigured()) {
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!subject) {
    console.warn("[push] VAPID_SUBJECT not set — push notifications disabled");
  } else {
    webpush.setVapidDetails(subject, publicKey!, privateKey!);
  }
}

/** POST /api/push/subscribe — requires login (CORE-69); the subscription is
 *  always tied to the calling user, never a client-supplied id. */
pushRouter.post(
  "/push/subscribe",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!isVapidConfigured()) {
      res.status(503).json({ error: "Push notifications not configured" });
      return;
    }

    const { endpoint, keys, expirationTime } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      expirationTime?: number | null;
    };

    if (!endpoint || typeof endpoint !== "string" || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: "Invalid subscription payload" });
      return;
    }

    const ua   = req.headers["user-agent"]?.slice(0, 300) ?? null;
    const slug = tenantSlugFromHost(req.hostname);

    await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      await client.query(
        `INSERT INTO push_subscription (user_id, endpoint, keys, user_agent)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = EXCLUDED.user_id,
               keys    = EXCLUDED.keys,
               user_agent = EXCLUDED.user_agent,
               last_used = NOW()`,
        [ctx.user.id, endpoint, JSON.stringify(keys), ua]
      );
    });

    res.status(204).end();
  })
);

/** DELETE /api/push/subscribe — requires login (CORE-69); only removes a
 *  subscription owned by the calling user. Another user's subscription (or
 *  one that doesn't exist) is indistinguishable from the caller's side: 404
 *  either way, never a silent no-op 204. */
pushRouter.delete(
  "/push/subscribe",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }

    const slug = tenantSlugFromHost(req.hostname);
    const deletedCount = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      const result = await client.query(
        "DELETE FROM push_subscription WHERE endpoint = $1 AND user_id = $2",
        [endpoint, ctx.user.id]
      );
      return result.rowCount ?? 0;
    });

    if (deletedCount === 0) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    res.status(204).end();
  })
);

/**
 * Send a push notification to all subscriptions for a given user.
 * Internal utility — not exposed as a public route.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; icon?: string }
): Promise<void> {
  if (!isVapidConfigured()) return;

  const db = getDb();
  if (!db) return;

  const { rows } = await db.query<{ endpoint: string; keys: { p256dh: string; auth: string } }>(
    "SELECT endpoint, keys FROM push_subscription WHERE user_id = $1",
    [userId]
  );

  await Promise.allSettled(
    rows.map(async (row) => {
      const subscription = { endpoint: row.endpoint, keys: row.keys };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        await db.query("UPDATE push_subscription SET last_used = NOW() WHERE endpoint = $1", [row.endpoint]);
      } catch (err: unknown) {
        // 410 Gone = subscription expired/revoked — clean up
        if (typeof err === "object" && err !== null && "statusCode" in err && (err as { statusCode: number }).statusCode === 410) {
          await db.query("DELETE FROM push_subscription WHERE endpoint = $1", [row.endpoint]);
        }
      }
    })
  );
}
