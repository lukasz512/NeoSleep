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
