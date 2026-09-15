import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: false,
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Integration tests hit a real DB (CLAUDE.md: "No mock-only tests for the
    // API server") — force them onto the isolated "test" tenant schema so a
    // local run (DEFAULT_TENANT_SLUG=neosleep in .env) can never write into
    // the schema real tenant data lives in. See scripts/sync-test-schema.ts,
    // which provisions/refreshes that schema (create_tenant_schema() alone is
    // stale relative to later migrations — see that script's own comment).
    env: {
      DEFAULT_TENANT_SLUG: "test",
      // orthoapnea-order.spec.ts / routes/partners/orthoapnea-treatments.spec.ts
      // mock the OrthoApnea HTTP boundary (fetch) entirely — these values are
      // never used to make a real request, they only need to be non-empty so
      // services/partners/orthoapnea.ts's login() doesn't short-circuit with
      // "not configured". Previously these tests only passed locally because
      // a developer's own .env happened to have real captured credentials
      // (from an earlier live-capture session) — CI correctly has no such
      // secret, which is what actually exposed this. Real credentials (when
      // genuinely needed, e.g. manual live-capture work) still come from
      // .env; this only sets a floor so the mocked test suite never depends
      // on that being present.
      ORTHOAPNEA_EMAIL: "qa-orthoapnea@neosleepcare.com",
      ORTHOAPNEA_PASSWORD: "test-only-not-a-real-credential",
    },
    // Integration tests share one remote dev Supabase project across every
    // spec file. Vitest's default file-level parallelism gives each file its
    // own worker (and each worker its own pg.Pool), which multiplies how many
    // connections get opened at once against that single shared project's
    // pooler — under contention, a query can be answered by Postgres almost
    // instantly and still take seconds to reach the app because the *next*
    // pool has to wait for a free backend connection. Running files
    // sequentially in one worker/one pool removes that multiplication.
    fileParallelism: false,
    // Individual queries here normally take 100-800ms round-tripping to the
    // remote dev Supabase project, but a query occasionally still lands behind
    // the shared pooler's backend-connection queue and takes several seconds
    // to be handed a connection — that's normal latency variance for a shared,
    // non-dedicated remote DB, not a hang. Vitest's 5s default was tight enough
    // to fail tests on that variance alone; a genuinely broken/infinite hang
    // still gets caught well before this.
    testTimeout: 15_000,
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
