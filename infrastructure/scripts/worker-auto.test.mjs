// node --test — worker-auto.mjs: which ticket the worker takes and what it does with it (CORE-183).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pick, guard, dryRun } from "./worker-auto.mjs";

const issue = (identifier, createdAt, state, labels = []) => ({ identifier, createdAt, state, labels });

test("@CORE-183 AC1 an auto-labelled Backlog/Todo ticket is picked FIFO next to Ready for Worker; ci-failed goes first", () => {
  const queue = [
    issue("CORE-3", "2026-10-03", "Todo", ["auto"]),
    issue("NEO-2", "2026-10-02", "Ready for Worker"),
    issue("CORE-1", "2026-10-01", "Backlog", ["auto"]),
    issue("CORE-0", "2026-09-30", "Todo"),
    issue("CORE-9", "2026-09-29", "Needs Review", ["auto"]),
    issue("NEO-8", "2026-09-28", "Worker: In Progress", ["auto"]),
  ];
  assert.deepEqual(pick(queue), { identifier: "CORE-1", mode: "auto" });
  assert.deepEqual(pick(queue.filter((i) => i.identifier !== "CORE-1")), { identifier: "NEO-2", mode: "ready" });
  assert.deepEqual(pick([...queue, issue("NEO-5", "2026-10-05", "Needs Review", ["ci-failed"])]), { identifier: "NEO-5", mode: "ci-fix" });
  assert.equal(pick([issue("CORE-0", "2026-09-30", "Todo"), issue("CORE-9", "2026-09-29", "Done", ["auto"])]), null);
  // label names compare case-insensitively, the way Linear shows them
  assert.equal(pick([issue("CORE-4", "2026-10-04", "Backlog", ["Auto"])]).mode, "auto");
});

test("@CORE-183 AC2 a diff that touches UI, a view, a route or a migration is refused with the reason", () => {
  assert.deepEqual(guard(["apps/api/src/commands/patient.ts", "docs/x.md", ".claude/hooks/a.sh"]), { ok: true, shape: "light" });
  for (const path of ["apps/pwa/src/components/A.vue", "packages/brand/x.css", "apps/pwa/src/views/PatientView.ts", "apps/api/src/routes/patient.ts", "apps/api/migrations/090_x.sql"]) {
    const g = guard(["docs/x.md", path]);
    assert.equal(g.ok, false, path);
    assert.deepEqual(g.offending, [path]);
    assert.match(g.comment, new RegExp(path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")));
    assert.match(g.comment, /interactive session/);
  }
});

test("@CORE-183 AC3 dry run of an auto ticket: claim → implement → guard → light handover → Needs Review, no Artifact page", () => {
  const run = dryRun([issue("CORE-7", "2026-10-07", "Todo", ["auto"])], ["apps/api/src/commands/x.ts", "apps/api/src/commands/x.spec.ts"]);
  assert.equal(run.ticket, "CORE-7");
  const kinds = run.steps.map((s) => s.do);
  assert.deepEqual(kinds, ["claim", "scope-check", "implement", "self-check", "guard", "push", "ci-wait", "light-handover", "comment", "state"]);
  assert.equal(run.steps.at(-1).to, "Needs Review");
  assert.match(run.steps.find((s) => s.do === "push").branch, /^worker\/core-7-/);
  assert.ok(!kinds.includes("artifact"), "auto tickets get the light handover, no page");
});

test("@CORE-183 AC2 dry run of an auto ticket whose diff turns out to be UI: reset, comment why, back to Todo without the label", () => {
  const run = dryRun([issue("CORE-7", "2026-10-07", "Todo", ["auto"])], ["apps/pwa/src/views/X.vue"]);
  const kinds = run.steps.map((s) => s.do);
  assert.deepEqual(kinds.slice(-5), ["guard", "reset", "comment", "remove-label", "state"]);
  assert.equal(run.steps.at(-1).to, "Todo");
  assert.ok(!kinds.includes("push"));
  assert.match(run.steps.find((s) => s.do === "comment").text, /X\.vue/);
});

test("an empty queue is a clean no-op", () => {
  assert.deepEqual(dryRun([], []), { ticket: null, steps: [] });
});
