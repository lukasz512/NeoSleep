// node --test — related-e2e.mjs against the real repo tree (NEO-182).
import { test } from "node:test";
import assert from "node:assert/strict";
import { relatedSpecs } from "./related-e2e.mjs";

test("a form field component relates to the form harness specs, not to unrelated harness pages", () => {
  const specs = relatedSpecs(["apps/pwa/src/components/ChoiceChipsField.vue"]);
  assert.ok(specs.includes("apps/pwa/e2e/form-errors.spec.ts"), specs.join(", "));
  assert.ok(!specs.includes("apps/pwa/e2e/breadcrumbs.spec.ts"), "lazy route imports must not link every view");
  assert.ok(!specs.includes("apps/pwa/e2e/stale-chunk.spec.ts"));
});

test("a global stylesheet relates to every harness spec; non-UI changes to none", () => {
  const all = relatedSpecs(["apps/pwa/src/assets/theme.scss"]);
  assert.ok(all.length >= relatedSpecs(["apps/pwa/src/components/ChoiceChipsField.vue"]).length);
  assert.ok(all.every((s) => s.startsWith("apps/pwa/e2e/") && s.endsWith(".spec.ts")));
  assert.deepEqual(relatedSpecs(["apps/api/src/commands/patient.ts", "docs/x.md"]), []);
});
