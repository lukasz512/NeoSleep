import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getDb } from "./connection.js";
import { runMigrations } from "./migrations.js";

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Each test writes its own throwaway migration files and cleans up the rows/tables they create. */
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function migrationDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "neo-migrations-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  cleanups.push(async () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function trackCleanup(filename: string, table: string): void {
  cleanups.push(async () => {
    await getDb().query("DELETE FROM schema_migrations WHERE filename = $1", [filename]);
    await getDb().query(`DROP TABLE IF EXISTS public.${table}`);
  });
}

describe("runMigrations", () => {
  it("applies a pending file exactly once when two runs start concurrently", async () => {
    const id = uniqueSuffix();
    const table = `qa_migration_probe_${id}`;
    const filename = `zz_qa_${id}.sql`;
    trackCleanup(filename, table);
    // Deliberately NOT idempotent: without the advisory lock the second concurrent run would
    // try to CREATE the table again and fail with "already exists".
    const dir = migrationDir({ [filename]: `CREATE TABLE public.${table} (id int);` });

    await Promise.all([runMigrations(dir), runMigrations(dir)]);

    const { rows } = await getDb().query<{ n: string }>(
      "SELECT count(*) AS n FROM schema_migrations WHERE filename = $1",
      [filename]
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("rolls back a failing file completely — no half-applied schema, no bookkeeping row", async () => {
    const id = uniqueSuffix();
    const table = `qa_migration_broken_${id}`;
    const filename = `zz_qa_${id}.sql`;
    trackCleanup(filename, table);
    const dir = migrationDir({ [filename]: `CREATE TABLE public.${table} (id int); SELECT 1/0;` });

    await expect(runMigrations(dir)).rejects.toThrow();

    const { rows: recorded } = await getDb().query("SELECT 1 FROM schema_migrations WHERE filename = $1", [filename]);
    expect(recorded).toHaveLength(0);
    const { rows: tables } = await getDb().query("SELECT to_regclass($1) AS t", [`public.${table}`]);
    expect(tables[0].t).toBeNull();
  });
});
