import { Client } from "pg";

/**
 * Integration tests target the "test" tenant schema (see
 * scripts/sync-test-schema.ts), never "neosleep" — see vitest.config.ts,
 * which forces DEFAULT_TENANT_SLUG=test for every run.
 * Specs that create throwaway accounts follow the `qa-<label>-<suffix>`
 * email convention (see e.g. commands/lead.spec.ts); this sweeps them out
 * before and after the run so a crashed prior run can't leave stragglers.
 */
async function sweepTestData(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM test.identities WHERE email LIKE 'qa-%'`);
  } finally {
    await client.end();
  }
}

export async function setup(): Promise<void> {
  await sweepTestData();
}

export async function teardown(): Promise<void> {
  await sweepTestData();
}
