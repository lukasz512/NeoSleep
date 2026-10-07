// node --test — the Artifact's story coverage table and handover gate (CORE-182).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { storyGate, coverageHtml, coverageMap } from "./coverage.mjs";

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "ship-cov-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const STORY = "# XYZ-5 Visits\n\n## Acceptance criteria\n- Saved visit <b>survives</b> reload.\n- Error is shown.\n";

test("@CORE-182 AC4 the Artifact shows each criterion with its tests, gaps marked", () => {
  const root = repo({
    "docs/stories/xyz-5-visits.md": STORY,
    "apps/pwa/e2e/visits.spec.ts": 'test("@XYZ-5 AC1 reload", async ({ page }) => { await page.goto("/patients"); });\n',
  });
  const { c } = storyGate(root, "XYZ-5", []);
  const html = coverageHtml(c);
  assert.match(html, /\(1\/2\)/);
  assert.match(html, /apps\/pwa\/e2e\/visits\.spec\.ts:1<\/code> <span class="pill allow">e2e/);
  assert.match(html, /<td>AC2<\/td><td>Error is shown\.<\/td><td><span class="pill hole">no test/);
  assert.ok(!html.includes("<b>survives</b>"), "criterion text is escaped");
  assert.deepEqual(coverageMap(c)[0].tests, ["apps/pwa/e2e/visits.spec.ts:1"]);
  assert.equal(coverageHtml(storyGate(root, "XYZ-6", []).c), "", "no story, no table");
});

test("@CORE-182 AC2 the handover is refused while a UI change has untested criteria or no real-backend e2e", () => {
  const root = repo({ "docs/stories/xyz-5-visits.md": STORY, "apps/api/src/v.spec.ts": 'it("@XYZ-5 AC1 AC2 x", () => {});\n' });
  const ui = storyGate(root, "XYZ-5", ["apps/pwa/src/views/Visits.vue"]).problems;
  assert.equal(ui.length, 1);
  assert.match(ui[0], /real-backend e2e/);
  assert.deepEqual(storyGate(root, "XYZ-5", ["apps/api/src/commands/v.ts"]).problems, []);
  assert.match(storyGate(root, "XYZ-6", ["apps/api/migrations/090_x.sql"]).problems[0], /no story/);
});
