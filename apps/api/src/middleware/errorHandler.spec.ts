import { describe, it, expect, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { getDb } from "../db.js";
import { errorHandler } from "./errorHandler.js";

/**
 * CORE-185 (CodeQL sensitive-get-query, decision D2): list filters like
 * ?search=<patient name> travel in the query string. Our own logs and the
 * diagnostics table must only ever see the path, never the query.
 */
describe("errorHandler keeps the query string out of logs (real Postgres)", () => {
  const marker = `zzqueryspec${Date.now()}`;
  const patientName = "Kowalska";

  afterAll(async () => {
    await getDb().query("DELETE FROM platform.diagnostics WHERE message LIKE $1", [`%${marker}%`]);
    vi.unstubAllEnvs();
  });

  it("records the path without ?search=… in console and platform.diagnostics", async () => {
    vi.stubEnv("ENABLE_DIAGNOSTICS_DB", "1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    app.get("/api/v1/patients", () => {
      throw new Error(`${marker} boom`);
    });
    app.use(errorHandler);

    const res = await request(app).get(`/api/v1/patients?search=${patientName}`);
    expect(res.status).toBe(500);

    let rows: { metadata: unknown }[] = [];
    for (let i = 0; i < 40 && rows.length === 0; i++) {
      ({ rows } = await getDb().query("SELECT metadata FROM platform.diagnostics WHERE message LIKE $1", [`%${marker}%`]));
      if (rows.length === 0) await new Promise((r) => setTimeout(r, 50));
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toMatchObject({ path: "/api/v1/patients" });
    expect(JSON.stringify(rows[0]!.metadata)).not.toContain(patientName);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(patientName);
    consoleError.mockRestore();
  });
});
