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
    },
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
