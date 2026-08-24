const DEV_SESSION_SECRET = "dev-secret-change-in-production";

function readSessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return DEV_SESSION_SECRET;
}

export const SESSION_SECRET: string = readSessionSecret();

/** JWT signing secret — reuses SESSION_SECRET's value/validation on purpose (no separate
 *  env var / Render dashboard entry needed just to rename it). */
export const JWT_SECRET: string = SESSION_SECRET;

export const FRONTEND_URL: string = process.env.FRONTEND_URL ?? "http://localhost:5173";

/**
 * FRONTEND_URL can be a comma-separated list (e.g. one Render BFF serving both
 * pwa.neosleepcare.com and pwa-dev.neosleepcare.com — see server.ts's CORS
 * config). FRONTEND_URL itself must never be interpolated directly into a
 * redirect/link URL when it holds more than one value — that produces a
 * literally broken URL like "https://a.com,https://b.com/reset-password".
 * Use this array + a per-request resolver (see auth.ts's resolveFrontendOrigin)
 * to pick exactly one origin instead.
 */
export const FRONTEND_URLS: string[] = FRONTEND_URL.split(",").map((s) => s.trim()).filter(Boolean);

/** Supabase Storage — signed documents (GDPR consent, partner agreement PDFs). Backend-only, never sent to the frontend. */
export const SUPABASE_URL: string | undefined = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_KEY: string | undefined = process.env.SUPABASE_SERVICE_KEY;
export const SUPABASE_DOCUMENTS_BUCKET: string = process.env.SUPABASE_DOCUMENTS_BUCKET ?? "partner-documents";

/**
 * OrthoApnea (apneadock.es) — one shared NeoSleep account, used server-side
 * only. Optional: environments without it just have the partner feature
 * unavailable (see services/partners/orthoapnea.ts), the API server still boots.
 */
export const ORTHOAPNEA_BASE_URL: string = process.env.ORTHOAPNEA_BASE_URL ?? "https://apneadock.es";
export const ORTHOAPNEA_EMAIL: string | undefined = process.env.ORTHOAPNEA_EMAIL;
export const ORTHOAPNEA_PASSWORD: string | undefined = process.env.ORTHOAPNEA_PASSWORD;

/**
 * Resend — transactional email sender (password reset, partner invites, contact
 * form notifications), see mailer.ts. Sent over Resend's HTTP API, not SMTP —
 * SMTP ports are blocked on Render's Free plan (see ADR-016), so this is not
 * just a provider swap, it's the only thing that can actually work there.
 * RESEND_FROM_EMAIL must be on a domain verified in the Resend dashboard (DNS
 * records added there) — use a dedicated subdomain (mail.neosleepcare.com),
 * not the apex, so Resend's own MX/SPF/DKIM never collides with the apex
 * domain's human mail (Microsoft 365, see docs/INFRASTRUCTURE.md). No real
 * mailbox needs to exist behind that address. Optional: without both,
 * mailer.ts logs a warning and silently skips sending (see ORTHOAPNEA_* above
 * for the same pattern).
 */
export const RESEND_API_KEY: string | undefined = process.env.RESEND_API_KEY;
export const RESEND_FROM_EMAIL: string | undefined = process.env.RESEND_FROM_EMAIL;
/** Fixed admin inbox for internal notifications (e.g. contact form). */
export const RESEND_NOTIFY_TO: string | undefined = process.env.RESEND_NOTIFY_TO;
