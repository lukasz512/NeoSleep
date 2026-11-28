// node --test — flake-hunt-plan.mjs (CORE-58).
import { test } from "node:test";
import assert from "node:assert/strict";
import { huntPlan } from "./flake-hunt-plan.mjs";

test("nightly: the whole suite on WebKit, 3 times", () => {
  assert.deepEqual(huntPlan({ event: "schedule" }), { specs: "", repeat: 3, browsers: "webkit" });
});

test("push: only the changed spec files, 20 times on all three engines", () => {
  const changed = ["apps/pwa/e2e/auth.spec.ts", "apps/pwa/e2e/support/settle.ts", "apps/pwa/e2e/dialog-leave.spec.ts", "apps/pwa/playwright.config.ts"];
  assert.deepEqual(huntPlan({ event: "push", changed }), {
    specs: "e2e/auth.spec.ts e2e/dialog-leave.spec.ts",
    repeat: 20,
    browsers: "chromium firefox webkit",
  });
});

test("push without a changed spec (config, helper or this workflow): the whole suite on WebKit, twice", () => {
  assert.deepEqual(huntPlan({ event: "push", changed: ["apps/pwa/playwright.config.ts"] }), { specs: "", repeat: 2, browsers: "webkit" });
});

test("manual run: the inputs win, empty inputs fall back to the whole suite 20 times on WebKit", () => {
  assert.deepEqual(huntPlan({ event: "workflow_dispatch", inputs: { specs: "e2e/auth.spec.ts", repeat: "5", browsers: "webkit firefox" } }), {
    specs: "e2e/auth.spec.ts",
    repeat: 5,
    browsers: "webkit firefox",
  });
  assert.deepEqual(huntPlan({ event: "workflow_dispatch", inputs: { specs: "", repeat: "", browsers: "" } }), { specs: "", repeat: 20, browsers: "webkit" });
});

test("manual inputs that are not spec paths, a sane count or known engines are refused", () => {
  assert.throws(() => huntPlan({ event: "workflow_dispatch", inputs: { specs: "e2e/a.spec.ts; rm -rf ." } }), /specs/);
  assert.throws(() => huntPlan({ event: "workflow_dispatch", inputs: { repeat: "500" } }), /repeat/);
  assert.throws(() => huntPlan({ event: "workflow_dispatch", inputs: { browsers: "safari" } }), /browsers/);
});
