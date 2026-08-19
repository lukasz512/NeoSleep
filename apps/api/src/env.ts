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
 * Gmail SMTP — transactional email sender (password reset, contact form
 * notifications), see mailer.ts. GMAIL_USER must be a real, authenticatable
 * Google account (a personal @gmail.com works; a @neosleepcare.com address
 * does NOT — that domain's mail is on Microsoft 365, not Google Workspace, so
 * it can't do Gmail SMTP AUTH). GMAIL_APP_PASSWORD is a Google App Password,
 * not the account password. Optional: without both, mailer.ts logs a warning
 * and silently skips sending (see ORTHOAPNEA_* above for the same pattern).
 */
export const GMAIL_USER: string | undefined = process.env.GMAIL_USER;
export const GMAIL_APP_PASSWORD: string | undefined = process.env.GMAIL_APP_PASSWORD;
/** Fixed admin inbox for internal notifications (e.g. contact form). Falls back to GMAIL_USER itself. */
export const GMAIL_TO: string | undefined = process.env.GMAIL_TO ?? GMAIL_USER;
