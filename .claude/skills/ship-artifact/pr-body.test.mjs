import { test } from "node:test";
import assert from "node:assert/strict";
import { prBody, typeOfChange, hasEmptySummary } from "./pr-body.mjs";

const base = {
  ticket: "CORE-188",
  summary: "PR descriptions now fill the template. Reviewers see what changed and how to roll back.",
  files: [".claude/skills/ship-artifact/build.mjs", ".github/workflows/ci.yml", "CLAUDE.md"],
  verify: ["Generated PR body has every template section"],
  boardUrl: "https://pwa.neosleepcare.com/platform/board?item=CORE-188",
};

test("body carries every PR template section, in template order", () => {
  const body = prBody(base);
  const order = ["## Summary", "## Type of change", "## Changes", "## Testing", "## Compliance & data impact", "## Rollback", "## Related"];
  const at = order.map((h) => body.indexOf(h));
  assert.ok(at.every((i) => i >= 0), `missing section: ${order[at.indexOf(-1)]}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test("summary is filled, not the template placeholder", () => {
  const body = prBody(base);
  assert.match(body, /## Summary\n\nPR descriptions now fill the template\./);
  assert.equal(hasEmptySummary(body), false);
  assert.doesNotMatch(body, /<!--/);
});

test("changes are grouped by area with file counts", () => {
  const body = prBody(base);
  assert.match(body, /- `\.claude` — 1 file/);
  assert.match(body, /- `\.github` — 1 file/);
  assert.match(body, /- `CLAUDE\.md`/);
});

test("verify items become the testing checklist", () => {
  assert.match(prBody(base), /## Testing\n\n- \[ \] Generated PR body has every template section/);
});

test("a migration makes rollback and compliance explicit", () => {
  const body = prBody({ ...base, files: ["apps/api/migrations/063_x.sql", "apps/api/src/routes/x.ts"] });
  assert.match(body, /## Rollback\n\nContains migration `apps\/api\/migrations\/063_x\.sql`/);
  assert.match(body, /- \[ \] Touches personal or health data/);
});

test("tooling-only change is marked as no compliance impact and safe to revert", () => {
  const body = prBody(base);
  assert.match(body, /- \[x\] No compliance-relevant impact/);
  assert.match(body, /## Rollback\n\nSafe to revert as-is\./);
});

test("explicit rollback text wins over the default", () => {
  assert.match(prBody({ ...base, rollback: "Re-set API_URL_PROD." }), /## Rollback\n\nRe-set API_URL_PROD\./);
});

test("type of change follows kind first, then the files", () => {
  assert.equal(typeOfChange("bug fix", []), "Bug fix");
  assert.equal(typeOfChange("security fix", []), "Bug fix");
  assert.equal(typeOfChange("feature", []), "New feature");
  assert.equal(typeOfChange(undefined, ["docs/a.md", "README.md"]), "Documentation");
  assert.equal(typeOfChange(undefined, [".github/workflows/ci.yml", ".claude/hooks/x.sh"]), "Infrastructure / CI/CD");
  assert.equal(typeOfChange(undefined, ["apps/api/src/x.ts"]), "Refactor / cleanup (no behavior change)");
});

test("related lists ticket, board and artifact", () => {
  const body = prBody({ ...base, artifactUrl: "https://claude.ai/artifact/abc" });
  assert.match(body, /## Related\n\nCORE-188 · \[Board\]\(https:\/\/pwa\.neosleepcare\.com\/platform\/board\?item=CORE-188\) · \[Artifact\]\(https:\/\/claude\.ai\/artifact\/abc\)/);
});

test("empty-summary detector catches GitHub's untouched template", () => {
  const untouched = "Fix sort\n\n## Summary\n<!-- What does this PR do, and why? -->\n\n## Type of change\n- [ ] Bug fix";
  assert.equal(hasEmptySummary(untouched), true);
  assert.equal(hasEmptySummary("CORE-1\n\nTwo sentences only."), true);
  assert.equal(hasEmptySummary("## Summary\n\nReal text.\n\n## Type of change"), false);
});

test("body stays short enough for a compare URL", () => {
  const files = Array.from({ length: 400 }, (_, i) => `apps/pwa/src/f${i}.vue`);
  assert.ok(encodeURIComponent(prBody({ ...base, files })).length < 6000);
});
