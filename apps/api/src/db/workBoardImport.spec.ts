import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection.js";

/**
 * CORE-184: the Linear history lands through migration 060. It runs on a database that
 * may already hold some of those items (the shared Supabase DB, a re-run), so it must be
 * idempotent and must only ever move team counters forward. The migration runner applied
 * it once already; this applies it again and checks nothing changed.
 */
const MIGRATION = fileURLToPath(new URL("../../migrations/060_work_board_linear_history.sql", import.meta.url));

async function snapshot() {
  const { rows } = await getDb().query<{ items: number; events: number; counters: string }>(
    `SELECT (SELECT count(*)::int FROM platform.work_item WHERE source = 'linear_import') AS items,
            (SELECT count(*)::int FROM platform.work_item_event WHERE actor_kind = 'import') AS events,
            -- Only teams the import touches: other specs create and drop their own teams in parallel.
            (SELECT string_agg(key || '=' || next_number, ',' ORDER BY key) FROM platform.work_team
              WHERE key IN (SELECT team_key FROM platform.work_item WHERE source = 'linear_import')) AS counters`
  );
  return rows[0]!;
}

describe("migration 060 · Linear history import", () => {
  it("is idempotent: a second run adds no item, no event and leaves the counters", async () => {
    const before = await snapshot();
    expect(before.items).toBeGreaterThan(300);
    const client = await getDb().connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(MIGRATION, "utf8"));
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect(await snapshot()).toEqual(before);
  });

  it("continues each team's numbering after its highest imported key", async () => {
    const { rows } = await getDb().query<{ key: string; next_number: number; max_number: number }>(
      `SELECT t.key, t.next_number, max(i.number) AS max_number
         FROM platform.work_team t JOIN platform.work_item i ON i.team_key = t.key AND i.source = 'linear_import'
        GROUP BY t.key, t.next_number`
    );
    for (const row of rows) expect(row.next_number, row.key).toBeGreaterThan(row.max_number);
  });

  it("migration 062 (CORE-187) adds the tickets Linear got after 060, same keys, and is idempotent", async () => {
    const tail = fileURLToPath(new URL("../../migrations/062_work_board_linear_tail.sql", import.meta.url));
    const keys = [...readFileSync(tail, "utf8").matchAll(/'linear_import', '([A-Z]+-\d+)'/g)].map((m) => m[1]!);
    expect(keys).toContain("CORE-187");
    const { rows } = await getDb().query<{ key: string }>(
      `SELECT team_key || '-' || number AS key FROM platform.work_item WHERE linear_identifier = ANY($1)`,
      [keys]
    );
    expect(rows.map((r) => r.key).sort()).toEqual([...keys].sort());
    const before = await snapshot();
    const client = await getDb().connect();
    try {
      await client.query(readFileSync(tail, "utf8"));
    } finally {
      client.release();
    }
    expect(await snapshot()).toEqual(before);
  });

  it("keeps decisions and drops the agent's progress chatter", async () => {
    const { rows } = await getDb().query<{ noise: number; decisions: number }>(
      `SELECT count(*) FILTER (WHERE body ~* '^(work started|pushed|implemented)')::int AS noise,
              count(*) FILTER (WHERE body ~* '^(\\*\\*)?decisions?\\y')::int AS decisions
         FROM platform.work_item_event WHERE actor_kind = 'import' AND kind = 'comment'`
    );
    expect(rows[0]!.noise).toBe(0);
    expect(rows[0]!.decisions).toBeGreaterThan(0);
  });
});
