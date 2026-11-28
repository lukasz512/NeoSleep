import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CORE-266: runtime queries use the transaction pooler when DATABASE_POOL_URL is set;
// the migration runner always keeps a session-mode connection on DATABASE_URL.
describe("db connection URLs", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = "postgresql://u:p@session.example:5432/db";
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  async function hostOf(pool: { options: { connectionString?: string } }): Promise<string> {
    return new URL(pool.options.connectionString ?? "").port;
  }

  it("getDb prefers DATABASE_POOL_URL", async () => {
    process.env.DATABASE_POOL_URL = "postgresql://u:p@pool.example:6543/db";
    const { getDb } = await import("./connection.js");
    const pool = getDb();
    expect(await hostOf(pool)).toBe("6543");
    await pool.end();
  });

  it("getDb falls back to DATABASE_URL when no pool URL is set", async () => {
    delete process.env.DATABASE_POOL_URL;
    const { getDb } = await import("./connection.js");
    const pool = getDb();
    expect(await hostOf(pool)).toBe("5432");
    await pool.end();
  });

  it("createSessionPool always uses DATABASE_URL", async () => {
    process.env.DATABASE_POOL_URL = "postgresql://u:p@pool.example:6543/db";
    const { createSessionPool } = await import("./connection.js");
    const pool = createSessionPool();
    expect(await hostOf(pool)).toBe("5432");
    await pool.end();
  });
});
