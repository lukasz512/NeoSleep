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

/**
 * "test" is a bare structural clone (scripts/sync-test-schema.ts, DDL only —
 * no data) and isn't in platform.tenants, so none of the DML-bearing
 * migrations (002_seed.sql, 022_territory_ltree_scope.sql) ever seed it —
 * unlike "neosleep"/"fourseasons", it starts with zero territory rows.
 * user_roles.territory_id (migration 022) is NOT NULL with no hardcoded
 * default anymore (insertStaffUser falls back to "whichever row has
 * kind='global'") — every test that creates a staff user needs that row to
 * exist, which is effectively every integration test in this suite. Idempotent
 * (checked by kind, not deleted in teardown) — safe to run every time.
 */
async function seedTerritory(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    let { rows } = await client.query<{ id: string }>(`SELECT id FROM test.territory WHERE kind = 'global' LIMIT 1`);
    let globalId = rows[0]?.id;
    if (!globalId) {
      // path must embed the row's own id (see db/territory.ts's
      // recomputeTerritorySubtreePath) — insert a placeholder, then set the
      // real value now that the id is known.
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO test.territory (name, code, country_code, parent_id, kind, path)
         VALUES ('Global', 'global', 'GLOBAL', NULL, 'global', 'placeholder'::extensions.ltree)
         RETURNING id`
      );
      globalId = inserted.rows[0]!.id;
      await client.query(`UPDATE test.territory SET path = replace(id::text, '-', '_')::extensions.ltree WHERE id = $1`, [globalId]);
    }

    for (const { name, code } of [{ name: "Polska", code: "PL" }, { name: "México", code: "MX" }]) {
      ({ rows } = await client.query<{ id: string }>(
        `SELECT id FROM test.territory WHERE kind = 'country' AND country_code = $1 LIMIT 1`,
        [code]
      ));
      if (rows[0]) continue;
      const country = await client.query<{ id: string }>(
        `INSERT INTO test.territory (name, code, country_code, parent_id, kind, path)
         VALUES ($1, $2, $2, $3, 'country', 'placeholder'::extensions.ltree) RETURNING id`,
        [name, code, globalId]
      );
      await client.query(
        `UPDATE test.territory SET path = (SELECT path FROM test.territory WHERE id = $2) || replace(id::text, '-', '_')::extensions.ltree WHERE id = $1`,
        [country.rows[0]!.id, globalId]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

export async function setup(): Promise<void> {
  await seedTerritory();
  await sweepTestData();
}

export async function teardown(): Promise<void> {
  await sweepTestData();
}
