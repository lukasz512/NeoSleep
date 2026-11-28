import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getDb } from "../db.js";
import { insertDiagnostic, type DiagnosticInsert } from "../db/diagnostic.js";
import { getWorkItemByExternalRef, listWorkItemEvents, updateWorkItem } from "../db/workBoard.js";
import { errorTicketRef, priorityForUsers, runErrorDigest, scrubForTicket, syncErrorTicket } from "./errorTickets.js";

vi.mock("../mailer.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mailer.js")>()),
  sendContactEmail: vi.fn().mockResolvedValue(undefined),
}));

/**
 * CORE-190: app errors become board tickets. Real Postgres (platform.diagnostics,
 * work_item, work_item_event); each run uses its own team key and message marker.
 */
const TEAM = `E${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
const MARKER = `zzerrtickets ${Array.from({ length: 10 }, () => String.fromCharCode(103 + Math.floor(Math.random() * 20))).join("")}`;
const STACK = "setElement@https://pwa.neosleepcare.com/assets/AuthOrbs-BqX1a2b3.js:1:234";

let seq = 0;
/** A distinct error kind per call: letters only, so normalisation keeps them apart. */
function kind(): string {
  seq += 1;
  return `${MARKER} ${"k".repeat(seq)}`;
}

async function record(row: Partial<DiagnosticInsert> & { message: string }) {
  const entry: DiagnosticInsert = { level: "error", source: "frontend", env: "prod", ...row };
  const result = await insertDiagnostic(entry);
  return syncErrorTicket(entry, result, { team: TEAM });
}

describe("errors become board tickets (real Postgres)", () => {
  beforeAll(async () => {
    await getDb().query(`INSERT INTO platform.work_team (key, name, kind, sort_order) VALUES ($1, 'QA errors', 'client', 999)`, [TEAM]);
  });

  afterAll(async () => {
    await getDb().query("DELETE FROM platform.work_item WHERE team_key = $1", [TEAM]);
    await getDb().query("DELETE FROM platform.work_team WHERE key = $1", [TEAM]);
    const { rows } = await getDb().query<{ message_hash: string }>("SELECT message_hash FROM platform.diagnostics WHERE message LIKE $1", [`%${MARKER}%`]);
    await getDb().query("DELETE FROM platform.diagnostic_user WHERE message_hash = ANY($1)", [rows.map((r) => r.message_hash)]);
    await getDb().query("DELETE FROM platform.diagnostics WHERE message LIKE $1", [`%${MARKER}%`]);
  });

  it("opens one ticket for a new prod error with a stack, straight to Approved, and nothing more on repeats", async () => {
    const message = kind();
    const first = await record({ message, stack: STACK });
    expect(first.action).toBe("created");
    const again = await record({ message, stack: STACK });
    expect(again).toEqual({ action: "unchanged", key: first.key });

    const { rows } = await getDb().query("SELECT status, labels, priority, source FROM platform.work_item WHERE team_key = $1 AND title LIKE $2", [
      TEAM,
      `%${message}%`,
    ]);
    expect(rows).toEqual([{ status: "approved", labels: ["auto-error"], priority: 3, source: "error" }]);
  });

  it("sends a prod error without a stack to Triage", async () => {
    const result = await record({ message: kind() });
    const item = await getDb().query("SELECT status FROM platform.work_item WHERE team_key = $1 AND number = $2", [
      TEAM,
      Number(result.key!.split("-")[1]),
    ]);
    expect(item.rows[0]).toEqual({ status: "triage" });
  });

  it("files a dev error in Triage with the dev label and lowest priority, and escalates it when prod hits it too", async () => {
    const message = kind();
    const dev = await record({ message, stack: STACK, env: "dev" });
    let item = (await getDb().query("SELECT status, labels, priority FROM platform.work_item WHERE team_key = $1 AND title LIKE $2", [TEAM, `%${message}%`]))
      .rows[0];
    expect(item).toEqual({ status: "triage", labels: ["auto-error", "dev"], priority: 4 });

    const prod = await record({ message, stack: STACK, env: "prod" });
    expect(prod).toEqual({ action: "escalated", key: dev.key });
    item = (await getDb().query("SELECT status, labels, priority FROM platform.work_item WHERE team_key = $1 AND title LIKE $2", [TEAM, `%${message}%`]))
      .rows[0];
    expect(item).toEqual({ status: "approved", labels: ["auto-error"], priority: 3 });
  });

  it("reopens a done ticket with a 'Regressed' comment when the error comes back", async () => {
    const message = kind();
    const first = await record({ message, stack: STACK });
    const number = Number(first.key!.split("-")[1]);
    await updateWorkItem(TEAM, number, { status: "done" }, { name: "qa", kind: "human" });

    const back = await record({ message, stack: STACK });
    expect(back).toEqual({ action: "reopened", key: first.key });
    const item = await getWorkItemByExternalRef(errorTicketRef("frontend", (await insertDiagnostic({ level: "error", message, stack: STACK, source: "frontend", env: "prod" })).hash));
    expect(item?.status).toBe("approved");
    const events = await listWorkItemEvents(item!.id);
    expect(events.some((e) => e.kind === "comment" && e.body?.startsWith("Regressed"))).toBe(true);
  });

  it("never opens a ticket for a 4xx, a warning, a local error or a write that failed", async () => {
    expect((await record({ message: kind(), metadata: { status: 400 } })).action).toBe("skipped");
    expect((await record({ message: kind(), metadata: { status: "422" } })).action).toBe("skipped");
    expect((await record({ message: kind(), level: "warn" })).action).toBe("skipped");
    expect((await record({ message: kind(), env: "local" })).action).toBe("skipped");
    expect((await syncErrorTicket({ level: "error", message: "x", env: "prod" }, { id: null, isNew: false, hash: "" }, { team: TEAM })).action).toBe(
      "skipped"
    );
  });

  it("keeps personal data out of the ticket", async () => {
    const message = `${kind()} for jan.kowalski@example.pl`;
    const result = await record({ message, stack: `${STACK}\nat https://pwa.x/patients?name=Jan%20Kowalski:1:1` });
    const { rows } = await getDb().query<{ title: string; problem: string }>("SELECT title, problem FROM platform.work_item WHERE team_key = $1 AND number = $2", [
      TEAM,
      Number(result.key!.split("-")[1]),
    ]);
    const text = `${rows[0]!.title}\n${rows[0]!.problem}`;
    expect(text).not.toContain("kowalski");
    expect(text).not.toContain("Kowalski");
    expect(text.length).toBeLessThanOrEqual(1500);
  });

  it("caps new tickets at 10 an hour; the rest become comments on one 'Error flood' ticket", async () => {
    const { rows } = await getDb().query<{ n: string }>(
      "SELECT count(*) AS n FROM platform.work_item WHERE team_key = $1 AND external_ref LIKE 'diag:%'",
      [TEAM]
    );
    const room = 10 - Number(rows[0]!.n);
    for (let i = 0; i < room; i++) expect((await record({ message: kind() })).action).toBe("created");
    const over1 = await record({ message: kind() });
    const over2 = await record({ message: kind() });
    expect(over1.action).toBe("flood");
    expect(over2).toEqual(over1);
  });

  it("morning digest ranks by affected users and lists what the night fixed", async () => {
    await getDb().query("DELETE FROM platform.work_item WHERE team_key = $1", [TEAM]);
    const message = kind();
    let ticket: Awaited<ReturnType<typeof record>> = { action: "skipped" };
    for (const user of ["u1", "u2", "u3"]) ticket = await record({ message, stack: STACK, user_id: user });
    const number = Number(ticket.key!.split("-")[1]);
    await updateWorkItem(TEAM, number, { status: "building" }, { name: "nightly", kind: "agent" });
    await updateWorkItem(TEAM, number, { status: "needs_review" }, { name: "nightly", kind: "agent" });

    const digest = await runErrorDigest({ team: TEAM });
    expect(digest.created.map((c) => c.key)).toContain(ticket.key);
    expect(digest.fixed.map((f) => f.key)).toContain(ticket.key);
    expect(digest.active.find((a) => a.key === ticket.key)).toMatchObject({ hits: 3, users: 3 });
    expect(digest.emailed).toBe(true);
    const { rows } = await getDb().query("SELECT priority FROM platform.work_item WHERE team_key = $1 AND number = $2", [TEAM, number]);
    expect(rows[0]).toEqual({ priority: 2 });
  });
});

describe("scrubForTicket / priorityForUsers", () => {
  it("removes emails, tokens, uuids, phone numbers and query strings", () => {
    const out = scrubForTicket(
      "a@b.co Bearer abc.def eyJhbGc.eyJzdWIi.sig 3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47 +52 55 1234 5678 https://x.y/p?q=Jan 1234567"
    );
    expect(out).toBe("<email> Bearer <token> <jwt> <uuid> <number> https://x.y/p?<query> <number>");
  });

  it("stays fast on a client-sent message built to backtrack (CodeQL js/polynomial-redos)", () => {
    const hostile = ["+".repeat(50_000), "1 ".repeat(50_000), "a.".repeat(50_000), "a@" + "b.".repeat(50_000)];
    const started = performance.now();
    for (const text of hostile) scrubForTicket(text);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("ranks by distinct users; dev-only stays lowest", () => {
    expect([priorityForUsers(12, false), priorityForUsers(3, false), priorityForUsers(1, false), priorityForUsers(50, true)]).toEqual([1, 2, 3, 4]);
  });
});
