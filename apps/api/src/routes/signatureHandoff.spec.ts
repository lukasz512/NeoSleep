import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";

// CORE-172: the QR next to every signature pad, end to end over HTTP on a real DB.

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function doctorAuth(): Promise<string> {
  const email = `qa-handoff-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
  const user = await withTenant(TENANT_SLUG, async (client) =>
    insertStaffUser(client, email, "Route", "Doc", "doctor", await bcrypt.hash("irrelevant", 4), false)
  );
  return `Bearer ${signAuthToken({ id: user!.id, email, role: "doctor", token_version: 0 })}`;
}

describe("/api/v1/signature-handoff + /public/signature-handoff/*", () => {
  it("the doctor's start needs a login", async () => {
    const res = await request(app).post("/api/v1/signature-handoff").send({});
    expect(res.status).toBe(401);
  });

  it("start → phone lookup → phone sign → computer pickup, tokens only in POST bodies", async () => {
    const auth = await doctorAuth();
    const started = await request(app).post("/api/v1/signature-handoff").set("Authorization", auth).send({});
    expect(started.status).toBe(200);
    const { handoffToken: h, pickupToken: p } = started.body as { handoffToken: string; pickupToken: string };

    const lookup = await request(app).post("/api/v1/public/signature-handoff/lookup").send({ h });
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({ status: "pending", purpose: "doctor_print" });

    expect((await request(app).post("/api/v1/public/signature-handoff/pickup").send({ p })).body).toEqual({ status: "pending" });

    const sign = await request(app).post("/api/v1/public/signature-handoff/sign").send({ h, signatureDataUrl: SIGNATURE });
    expect(sign.status).toBe(200);
    expect((await request(app).post("/api/v1/public/signature-handoff/sign").send({ h, signatureDataUrl: SIGNATURE })).status).toBe(404);

    expect((await request(app).post("/api/v1/public/signature-handoff/pickup").send({ p })).body).toEqual({ status: "signed", signatureDataUrl: SIGNATURE });
    expect((await request(app).post("/api/v1/public/signature-handoff/pickup").send({ p })).body).toEqual({ status: "expired" });
    expect((await request(app).post("/api/v1/public/signature-handoff/lookup").send({ h })).status).toBe(404);
  });

  it("an unusable questionnaire link starts nothing (410, like the other /q routes)", async () => {
    const res = await request(app).post("/api/v1/public/questionnaire/sign-handoff").send({ token: "x".repeat(43) });
    expect(res.status).toBe(410);
  });
});
