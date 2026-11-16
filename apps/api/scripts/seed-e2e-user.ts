/**
 * Seeds one staff user for the PWA's Playwright E2E suite (apps/pwa/e2e/) —
 * run by apps/pwa/e2e/global-setup.ts, which passes a fresh random
 * E2E_USER_PASSWORD each run. Local databases only (CORE-180, see
 * e2e-seed-guard.ts).
 *
 * Idempotent: insertStaffUser creates the user once, and the password hash is
 * reset on every run so a new random password works against a reused DB.
 */
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../src/db.js";
import { assertLocalDatabase, requireE2EPassword } from "./e2e-seed-guard.js";

export const E2E_USER_EMAIL = "e2e-auth@neosleepcare.com";

async function seed(): Promise<void> {
  assertLocalDatabase(process.env.DATABASE_URL);
  const password = requireE2EPassword(process.env.E2E_USER_PASSWORD);
  const slug = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
  const hash = await bcrypt.hash(password, 4);
  await withTenant(slug, async (client) => {
    await insertStaffUser(client, E2E_USER_EMAIL, "E2E", "Auth", "rep", hash, false);
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = now()
       FROM identities WHERE users.identity_id = identities.id AND identities.email = $2`,
      [hash, E2E_USER_EMAIL],
    );
  });
}

seed()
  .then(() => {
    console.log(`[seed-e2e-user] ready: ${E2E_USER_EMAIL}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed-e2e-user] failed:", err);
    process.exit(1);
  });
