// ci-scope — what the CI test job runs (CORE-152, decisions ci-tests-r1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { scope } from "./ci-scope.mjs";

const work = (changed) => scope({ event: "push", branch: "worktree-core-1-x", changed });

test("D2: the promote PR runs nothing itself and mirrors the dev run", () => {
  const r = scope({ event: "pull_request", branch: "dev", headRef: "dev", changed: [] });
  assert.equal(r.mirror, true);
  assert.equal(r.runApp, false);
});

test("D1: Firefox only in the nightly/manual run; dev and prod pushes run Chromium + WebKit, every spec", () => {
  assert.equal(scope({ event: "schedule", branch: "dev", changed: [] }).browsers, "chromium firefox webkit");
  assert.equal(scope({ event: "workflow_dispatch", branch: "dev", changed: [] }).browsers, "chromium firefox webkit");
  for (const branch of ["dev", "prod"]) {
    const r = scope({ event: "push", branch, changed: ["apps/pwa/src/components/ChoiceChipsField.vue"] });
    assert.deepEqual([r.runApp, r.browsers, r.specs], [true, "chromium webkit", []]);
  }
  const renovate = scope({ event: "pull_request", branch: "renovate/vite", headRef: "renovate/vite", changed: [] });
  assert.deepEqual([renovate.browsers, renovate.specs], ["chromium webkit", []]);
});

test("a docs/.claude-only push runs no app tests", () => {
  const r = work(["docs/x.md", ".claude/hooks/quality-gate.sh", "README.md", "apps/api/NOTES.md"]);
  assert.equal(r.runApp, false);
  assert.equal(work(["docs/x.md", "apps/api/src/commands/patient.ts"]).runApp, true);
});

test("D3: shared code runs every spec on Chromium", () => {
  for (const f of ["packages/ui/src/AppButton.vue", "apps/pwa/src/layouts/AppLayout.vue", "apps/pwa/src/assets/theme.scss", "pnpm-lock.yaml", ".github/workflows/ci.yml"]) {
    const r = work([f]);
    assert.deepEqual([r.runApp, r.browsers, r.specs], [true, "chromium", []], f);
  }
});

test("D3: a component change runs its related specs + auth, not the whole suite", () => {
  const r = work(["apps/pwa/src/components/ChoiceChipsField.vue"]);
  assert.equal(r.browsers, "chromium");
  assert.ok(r.specs.includes("apps/pwa/e2e/auth.spec.ts"));
  assert.ok(r.specs.some((s) => s.includes("form")), r.specs.join(" "));
  assert.ok(!r.specs.includes("apps/pwa/e2e/breadcrumbs.spec.ts"));
});

test("D3: a .ts change in the app (store/composable) also seeds related specs", () => {
  const r = work(["apps/pwa/src/utils/calendarLayout.ts"]);
  assert.deepEqual(r.specs, ["apps/pwa/e2e/auth.spec.ts", "apps/pwa/e2e/calendar.spec.ts"]);
});

test("an API change adds the API-backed specs; an edited spec always runs", () => {
  const api = work(["apps/api/src/commands/patient.ts"]);
  assert.ok(api.specs.includes("apps/pwa/e2e/partner-document-dialog.spec.ts"));
  assert.ok(!api.specs.includes("apps/pwa/e2e/breadcrumbs.spec.ts"));
  assert.ok(work(["apps/pwa/e2e/calendar.spec.ts"]).specs.includes("apps/pwa/e2e/calendar.spec.ts"));
});

test("a work branch with no diff runs everything on Chromium", () => {
  const r = work([]);
  assert.deepEqual([r.runApp, r.browsers, r.specs], [true, "chromium", []]);
});
