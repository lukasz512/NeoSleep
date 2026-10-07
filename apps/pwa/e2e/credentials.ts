import { randomBytes } from "node:crypto";

/** The one staff user the E2E suite logs in as — seeded by apps/api/scripts/seed-e2e-user.ts. */
export const E2E_EMAIL = "e2e-auth@neosleepcare.com";

/**
 * CORE-180: the password is generated per run, never committed. globalSetup
 * calls this first; Playwright passes the env var it sets on to the seed child
 * process and to every test worker.
 */
export function ensureE2EPassword(): string {
  process.env.E2E_USER_PASSWORD ||= randomBytes(24).toString("base64url");
  return process.env.E2E_USER_PASSWORD;
}

export function e2ePassword(): string {
  const value = process.env.E2E_USER_PASSWORD;
  if (!value) throw new Error("E2E_USER_PASSWORD is unset — globalSetup did not run");
  return value;
}
