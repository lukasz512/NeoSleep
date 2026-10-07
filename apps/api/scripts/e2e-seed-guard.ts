/**
 * Guards for seed-e2e-user.ts (CORE-180). The E2E account used to have a
 * password committed to this public repo and was seeded into whatever the root
 * .env pointed at — which is the production Supabase project. Both are now
 * refused here, so the account can only ever exist on a throwaway local DB.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

/** Throws unless DATABASE_URL points at a local Postgres (CI service or docker). */
export function assertLocalDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const host = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`refusing to seed the E2E user into a non-local database (${host})`);
  }
}

/** The password comes from the environment only — never from source. */
export function requireE2EPassword(value: string | undefined): string {
  if (!value || value.length < 16) {
    throw new Error("E2E_USER_PASSWORD must be set (16+ chars); apps/pwa/e2e/global-setup.ts generates one per run");
  }
  return value;
}
