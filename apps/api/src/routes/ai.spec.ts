import { describe, it, expect, afterAll, beforeAll, afterEach, vi } from "vitest";

const previousKey = vi.hoisted(() => {
  const before = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-real";
  return before;
});

import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";
import { buildKnowledge, flattenJson, loadKnowledge } from "../ai/knowledge.js";
import { MAX_QUESTION_CHARS } from "./ai.js";

/**
 * NeoSleep AI stage 1 (CORE-274) through the real Express stack and real Postgres.
 * Only the outbound Anthropic HTTP call is stubbed; auth, role gate, audit_log are real.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Account { id: string; auth: string }

async function account(role: StaffRole): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-ai-${role}-${SUFFIX}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", `Ai ${role}`, role, hash, false);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

async function auditRows(userId: string) {
  return withTenant(TENANT_SLUG, async (client) => {
    const { rows } = await client.query(
      "SELECT outcome, metadata FROM audit_log WHERE user_id = $1 AND entity_type = 'AiChat' ORDER BY created_at",
      [userId]
    );
    return rows as Array<{ outcome: string; metadata: Record<string, unknown> }>;
  });
}

function stubAnthropic(text: string) {
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({
        content: [{ type: "text", text }],
        model: "claude-sonnet-5-5",
        usage: { input_tokens: 1234, output_tokens: 21 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("POST /api/v1/ai/chat", () => {
  let admin: Account;
  let doctor: Account;
  let rep: Account;

  beforeAll(async () => {
    admin = await account("admin");
    doctor = await account("doctor");
    rep = await account("rep");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    await withTenant(TENANT_SLUG, async (client) => {
      await client.query("DELETE FROM audit_log WHERE user_id = ANY($1::uuid[])", [[admin.id, doctor.id, rep.id]]);
    });
    await getDb().query("DELETE FROM identities WHERE email LIKE $1", [`qa-ai-%-${SUFFIX}@%`]).catch(() => undefined);
  });

  it("rejects a request without a token (401)", async () => {
    await request(app).post("/api/v1/ai/chat").send({ question: "hi" }).expect(401);
  });

  it.each([["doctor"], ["rep"]] as const)("rejects the %s role (403) and never calls the provider", async (role) => {
    const fetchMock = stubAnthropic("should not be used");
    const who = role === "doctor" ? doctor : rep;
    await request(app).post("/api/v1/ai/chat").set("Authorization", who.auth).send({ question: "hi" }).expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty or over-long question (400)", async () => {
    stubAnthropic("x");
    await request(app).post("/api/v1/ai/chat").set("Authorization", admin.auth).send({ question: "  " }).expect(400);
    await request(app)
      .post("/api/v1/ai/chat")
      .set("Authorization", admin.auth)
      .send({ question: "a".repeat(MAX_QUESTION_CHARS + 1) })
      .expect(400);
  });

  it("answers an admin, sends the knowledge to the provider, and audits without storing the question", async () => {
    const fetchMock = stubAnthropic("A new invite cancels the previous one.");
    const question = "If I generate a new invite, is the last one cancelled? secret-marker-xyz";
    const res = await request(app).post("/api/v1/ai/chat").set("Authorization", admin.auth).send({ question }).expect(200);
    expect(res.body).toEqual({ answer: "A new invite cancels the previous one." });

    const call = fetchMock.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(call[1].body) as { system: Array<{ text: string }>; messages: Array<{ content: string }>; max_tokens: number };
    expect(body.system[1]!.text).toContain("KNOWLEDGE:");
    expect(body.messages[0]!.content).toBe(question);
    expect(body.max_tokens).toBeLessThanOrEqual(400);

    const rows = await auditRows(admin.id);
    const last = rows[rows.length - 1]!;
    expect(last.outcome).toBe("success");
    expect(last.metadata).toMatchObject({ question_chars: question.length, input_tokens: 1234, output_tokens: 21 });
    expect(JSON.stringify(rows)).not.toContain("secret-marker-xyz");
  });

  it("answers 503 and audits a failure when the provider is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await request(app).post("/api/v1/ai/chat").set("Authorization", admin.auth).send({ question: "hello" }).expect(503);
    const rows = await auditRows(admin.id);
    expect(rows[rows.length - 1]!.outcome).toBe("serious_failure");
  });
});

describe("AI knowledge bundle", () => {
  it("is built from the guide and the clinical protocol, within the size cap", () => {
    const text = buildKnowledge();
    expect(text).toContain("# User guide");
    expect(text).toContain("# Clinical care protocol");
    expect(loadKnowledge().length).toBeGreaterThan(1000);
  });

  it("flattens JSON text and drops empty strings", () => {
    expect(flattenJson({ a: "one", b: ["two", "  "], c: { d: "three" }, e: 5 })).toEqual(["one", "two", "three"]);
  });
});
