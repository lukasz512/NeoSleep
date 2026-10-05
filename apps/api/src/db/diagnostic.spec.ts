import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "../db.js";
import { diagnosticMessageHash, insertDiagnostic, normaliseDiagnosticMessage } from "./diagnostic.js";

describe("normaliseDiagnosticMessage", () => {
  it("replaces uuids, timestamps, hex ids and long digit runs with placeholders", () => {
    const a = normaliseDiagnosticMessage(
      "Patient 3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47 failed at 2026-10-05T09:15:30.123Z, order 454012, ref deadbeefcafe01"
    );
    expect(a).toBe("Patient <uuid> failed at <ts>, order <n>, ref <hex>");
  });

  it("keeps short numbers (status codes) so different errors stay apart", () => {
    expect(normaliseDiagnosticMessage("HTTP 500 from lab")).toBe("HTTP 500 from lab");
    expect(diagnosticMessageHash("HTTP 500 from lab")).not.toBe(diagnosticMessageHash("HTTP 404 from lab"));
  });

  it("trims and caps at 2000 characters", () => {
    expect(normaliseDiagnosticMessage("  hello  ")).toBe("hello");
    expect(normaliseDiagnosticMessage("x".repeat(5000))).toHaveLength(2000);
  });

  it("gives two messages that differ only in ids the same hash", () => {
    expect(diagnosticMessageHash(`Row ${randomUUID()} missing`)).toBe(diagnosticMessageHash(`Row ${randomUUID()} missing`));
  });
});

/** Letters only, so the random part survives normalisation and each run gets its own error kind. */
function uniqueWord(): string {
  return Array.from({ length: 12 }, () => String.fromCharCode(103 + Math.floor(Math.random() * 20))).join("");
}

describe("insertDiagnostic dedup (real Postgres)", () => {
  const marker = `zzdedupspec ${uniqueWord()}`;

  afterAll(async () => {
    await getDb().query("DELETE FROM platform.diagnostics WHERE message LIKE $1", [`%${marker}%`]);
  });

  async function rows(): Promise<{ id: string; count: number; status: string; user_id: string | null; tenant_slug: string | null }[]> {
    const { rows: r } = await getDb().query(
      "SELECT id, count, status, user_id, tenant_slug FROM platform.diagnostics WHERE message LIKE $1 ORDER BY created_at",
      [`%${marker}%`]
    );
    return r;
  }

  it("stores the same error once and counts repeats, refreshing user and tenant", async () => {
    const first = await insertDiagnostic({ level: "error", message: `${marker} order ${randomUUID()}`, source: "api", env: "test" });
    expect(first.isNew).toBe(true);
    const second = await insertDiagnostic({
      level: "error",
      message: `${marker} order ${randomUUID()}`,
      source: "api",
      env: "test",
      user_id: "user-1",
      tenant_slug: "test",
    });
    expect(second).toEqual({ id: first.id, isNew: false });

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ count: 2, status: "open", user_id: "user-1", tenant_slug: "test" });
  });

  it("does not merge the same message from another source or env", async () => {
    await insertDiagnostic({ level: "error", message: `${marker} order ${randomUUID()}`, source: "frontend", env: "test" });
    await insertDiagnostic({ level: "error", message: `${marker} order ${randomUUID()}`, source: "api", env: "production" });
    expect(await rows()).toHaveLength(3);
  });

  it("reopens a resolved error when it comes back", async () => {
    const [row] = await rows();
    await getDb().query("UPDATE platform.diagnostics SET status = 'resolved' WHERE id = $1", [row!.id]);
    await insertDiagnostic({ level: "error", message: `${marker} order ${randomUUID()}`, source: "api", env: "test" });
    const { rows: after } = await getDb().query("SELECT status, count FROM platform.diagnostics WHERE id = $1", [row!.id]);
    expect(after[0]).toMatchObject({ status: "open", count: 3 });
  });

  it("keeps a dismissed error dismissed but still counts it", async () => {
    const [row] = await rows();
    await getDb().query("UPDATE platform.diagnostics SET status = 'dismissed' WHERE id = $1", [row!.id]);
    const result = await insertDiagnostic({ level: "error", message: `${marker} order ${randomUUID()}`, source: "api", env: "test" });
    expect(result.isNew).toBe(false);
    const { rows: after } = await getDb().query("SELECT status, count FROM platform.diagnostics WHERE id = $1", [row!.id]);
    expect(after[0]).toMatchObject({ status: "dismissed", count: 4 });
  });
});
