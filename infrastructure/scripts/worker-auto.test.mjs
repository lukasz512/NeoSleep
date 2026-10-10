// node --test — worker-auto.mjs: which card the worker takes and what it does with it (CORE-183).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pick, guard, dryRun } from "./worker-auto.mjs";

const item = (key, created_at, status, labels = []) => ({ key, created_at, status, labels });

test("@CORE-183 AC1 the worker takes approved cards FIFO, `auto` ones in auto mode, ci-failed first", () => {
  const queue = [
    item("CORE-3", "2026-10-03", "approved", ["auto"]),
    item("NEO-2", "2026-10-02", "approved"),
    item("CORE-1", "2026-10-01", "backlog", ["auto"]),
    item("CORE-9", "2026-09-29", "needs_review", ["auto"]),
    item("NEO-8", "2026-09-28", "building", ["auto"]),
  ];
  assert.deepEqual(pick(queue), { key: "NEO-2", mode: "ready" }, "not approved = not the worker's");
  assert.deepEqual(pick(queue.filter((i) => i.key !== "NEO-2")), { key: "CORE-3", mode: "auto" });
  assert.deepEqual(pick([...queue, item("NEO-5", "2026-10-05", "needs_review", ["ci-failed"])]), { key: "NEO-5", mode: "ci-fix" });
  assert.equal(pick([item("CORE-0", "2026-09-30", "backlog"), item("CORE-9", "2026-09-29", "done", ["auto"])]), null);
  // label names compare case-insensitively
  assert.equal(pick([item("CORE-4", "2026-10-04", "approved", ["Auto"])]).mode, "auto");
});

test("@CORE-183 AC2 a diff that touches UI, a view, a route or a migration is refused with the reason", () => {
  assert.deepEqual(guard(["apps/api/src/commands/patient.ts", "docs/x.md", ".claude/hooks/a.sh"]), { ok: true, shape: "light" });
  for (const path of ["apps/pwa/src/components/A.vue", "packages/brand/x.css", "apps/pwa/src/views/PatientView.ts", "apps/api/src/routes/patient.ts", "apps/api/migrations/090_x.sql"]) {
    const g = guard(["docs/x.md", path]);
    assert.equal(g.ok, false, path);
    assert.deepEqual(g.offending, [path]);
    assert.match(g.comment, /^Blocked: /);
    assert.ok(g.comment.includes(`\`${path}\``), path);
    assert.match(g.comment, /interactive session/);
  }
});

test("@CORE-183 AC3 dry run of an auto card: claim → implement → guard → light handover → needs_review, no Artifact page", () => {
  const run = dryRun([item("CORE-7", "2026-10-07", "approved", ["auto"])], ["apps/api/src/commands/x.ts", "apps/api/src/commands/x.spec.ts"]);
  assert.equal(run.ticket, "CORE-7");
  const kinds = run.steps.map((s) => s.do);
  assert.deepEqual(kinds, ["claim", "scope-check", "implement", "self-check", "guard", "push", "ci-wait", "light-handover", "comment", "state"]);
  assert.equal(run.steps[0].to, "building");
  assert.equal(run.steps.at(-1).to, "needs_review");
  assert.match(run.steps.find((s) => s.do === "push").branch, /^worker\/core-7-/);
  assert.ok(!kinds.includes("artifact"), "auto cards get the light handover, no page");
});

test("@CORE-183 AC2 dry run of an auto card whose diff turns out to be UI: reset and a Blocked comment, nothing pushed", () => {
  const run = dryRun([item("CORE-7", "2026-10-07", "approved", ["auto"])], ["apps/pwa/src/views/X.vue"]);
  const kinds = run.steps.map((s) => s.do);
  assert.deepEqual(kinds.slice(-3), ["guard", "reset", "comment"]);
  assert.ok(!kinds.includes("push") && !kinds.includes("state"), "the card stays in building");
  assert.match(run.steps.at(-1).text, /X\.vue/);
});

test("an empty queue is a clean no-op", () => {
  assert.deepEqual(dryRun([], []), { ticket: null, steps: [] });
});
