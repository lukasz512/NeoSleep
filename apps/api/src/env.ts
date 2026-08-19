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

export const FRONTEND_URL: string = process.env.FRONTEND_URL ?? "http://localhost:5173";

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
 * records added there) — use a dedicated subdomain (e.g. send.neosleepcare.com),
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
