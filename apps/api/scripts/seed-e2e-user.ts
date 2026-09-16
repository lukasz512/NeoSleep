/**
 * Seeds one deterministic staff user for the PWA's Playwright E2E suite
 * (apps/pwa/e2e/) — run with: pnpm --filter @neo/api exec tsx scripts/seed-e2e-user.ts
 *
 * Idempotent (insertStaffUser upserts on email), so it's safe to run before
 * every E2E run rather than tracking whether it already ran.
 */
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../src/db.js";

export const E2E_USER_EMAIL = "e2e-auth@neosleepcare.com";
export const E2E_USER_PASSWORD = "e2e-correct-horse-battery-staple";

async function seed(): Promise<void> {
  const slug = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
  const hash = await bcrypt.hash(E2E_USER_PASSWORD, 4);
  await withTenant(slug, (client) =>
    insertStaffUser(client, E2E_USER_EMAIL, "E2E", "Auth", "rep", hash, false),
  );
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
