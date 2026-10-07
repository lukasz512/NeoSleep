// node --test — story-coverage.mjs against a throwaway repo tree (CORE-182).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCriteria, storyForTicket, collectTags, coverage, ticketOf, needs, allStories } from "./story-coverage.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "story-coverage.mjs");

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "story-cov-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const STORY = `## Refined User Story: Visits (XYZ-9)

### Context
- not a criterion

### Acceptance Criteria
- [ ] A doctor saves a visit and sees it after reload.
- [ ] A failed save shows the error.
  - a nested note, not a criterion
- [x] The calendar shows the visit.

### Hand-off
- not a criterion either
`;

test("@CORE-182 AC1 criteria are the top-level items under Acceptance headings, numbered AC1..n", () => {
  const acs = parseCriteria(STORY);
  assert.deepEqual(acs.map((a) => a.id), ["AC1", "AC2", "AC3"]);
  assert.equal(acs[1].text, "A failed save shows the error.");
  // numbered lists and an explicit "AC7:" label are honored; numbering continues across sections
  const two = parseCriteria("## Acceptance criteria\n1. One\n2. AC7: Seven\n\n## Acceptance (follow-up)\n- Eight\n");
  assert.deepEqual(two.map((a) => a.id), ["AC1", "AC7", "AC8"]);
  assert.equal(two[1].text, "Seven");
});

test("@CORE-182 AC1 a ticket finds its story by file name or by the ticket id in the first heading", () => {
  const root = repo({
    "docs/stories/core-45-filters.md": "# Filters\n## Acceptance criteria\n- x\n",
    "docs/stories/visits.md": STORY,
    "docs/stories/other.md": "# Other\nMentions XYZ-9 in the body only.\n",
  });
  assert.equal(storyForTicket(root, "CORE-45"), "docs/stories/core-45-filters.md");
  assert.equal(storyForTicket(root, "XYZ-9"), "docs/stories/visits.md");
  assert.equal(storyForTicket(root, "XYZ-90"), null);
});

test("@CORE-182 AC1 tests are tagged @TICKET ACn; a real-backend e2e is a pwa e2e spec that loads no harness page and stubs no /api", () => {
  const root = repo({
    "apps/pwa/e2e/visits.spec.ts": 'test("@XYZ-9 AC1 AC3 saved visit survives reload", async ({ page }) => { await page.goto("/patients"); });\n',
    "apps/pwa/e2e/layout.spec.ts": 'test("@XYZ-9 AC3 layout", async ({ page }) => { await page.goto("/e2e/harness/form.html"); });\n',
    "apps/pwa/e2e/stubbed.spec.ts": 'test("@XYZ-9 AC3 stubbed", async ({ page }) => { await page.route("**/api/v1/**", (r) => r.fulfill({ json: [] })); });\n',
    "apps/api/src/commands/visit.spec.ts": 'it("@XYZ-9 AC2, AC3 rolls back on failure", () => {});\n',
    "apps/api/src/commands/visit.ts": '// "@XYZ-9 AC2" in source code is not a test\n',
  });
  const tags = collectTags(root);
  const neo9 = tags.get("XYZ-9");
  assert.deepEqual([...neo9.keys()].sort(), ["AC1", "AC2", "AC3"]);
  assert.equal(neo9.get("AC2").length, 1, "only test files count");
  const ac3 = neo9.get("AC3");
  assert.equal(ac3.length, 4);
  assert.deepEqual(ac3.filter((t) => t.realBackend).map((t) => t.file), ["apps/pwa/e2e/visits.spec.ts"]);
});

test("@CORE-182 AC1 coverage lists covered and uncovered criteria of the ticket's story", () => {
  const root = repo({
    "docs/stories/visits.md": STORY,
    "apps/api/src/visit.spec.ts": 'it("@XYZ-9 AC1 saves", () => {});\n',
  });
  const c = coverage(root, "XYZ-9");
  assert.equal(c.story, "docs/stories/visits.md");
  assert.deepEqual(c.criteria.map((a) => [a.id, a.tests.length]), [["AC1", 1], ["AC2", 0], ["AC3", 0]]);
  assert.deepEqual(c.uncovered, ["AC2", "AC3"]);
  assert.equal(c.realBackendE2e, 0);
  assert.equal(coverage(root, "XYZ-90").story, null);
});

test("@CORE-182 AC2 a UI change needs a story, every criterion tested, and one real-backend e2e; a light change only a covered story if it has one", () => {
  const root = repo({
    "docs/stories/visits.md": STORY,
    "apps/pwa/e2e/visits.spec.ts": 'test("@XYZ-9 AC1 AC2 AC3 visit flow", async () => {});\n',
  });
  assert.deepEqual(needs(["apps/pwa/src/views/Visits.vue"]), { story: true, e2e: true });
  assert.deepEqual(needs(["apps/api/src/routes/visit.ts"]), { story: true, e2e: false });
  assert.deepEqual(needs([".claude/hooks/x.sh", "docs/a.md"]), { story: false, e2e: false });

  const ok = coverage(root, "XYZ-9");
  assert.deepEqual(ok.problems({ story: true, e2e: true }), []);
  const none = coverage(root, "XYZ-90");
  assert.match(none.problems({ story: true, e2e: false })[0], /no story/i);
  assert.deepEqual(none.problems({ story: false, e2e: false }), []);

  const half = repo({ "docs/stories/visits.md": STORY, "apps/pwa/e2e/h.spec.ts": 'test("@XYZ-9 AC1 x", async ({page}) => { await page.goto("/e2e/harness/a.html"); });\n' });
  const p = coverage(half, "XYZ-9").problems({ story: true, e2e: true });
  assert.ok(p.some((m) => /AC2, AC3/.test(m)), p.join("\n"));
  assert.ok(p.some((m) => /real-backend e2e/.test(m)), p.join("\n"));
});

test("@CORE-182 AC2 the CLI exits 1 on a gap for the branch's ticket and 0 on dev (report only)", () => {
  const root = repo({
    ".claude/ticket-teams": "XYZ\nCORE\n",
    "docs/stories/visits.md": STORY,
    "apps/api/src/visit.spec.ts": 'it("@XYZ-9 AC1 saves", () => {});\n',
  });
  assert.equal(ticketOf(root, "worktree-xyz-9-visits"), "XYZ-9");
  assert.equal(ticketOf(root, "dev"), null);
  const run = (args) => {
    try { return { code: 0, out: execFileSync("node", [SCRIPT, "--root", root, ...args], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
  };
  const red = run(["--branch", "worktree-xyz-9-visits"]);
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /AC2/);
  assert.equal(run(["--branch", "dev"]).code, 0);
});

test("@CORE-182 AC3 the all-stories report has one row per story with covered/total", () => {
  const root = repo({
    "docs/stories/visits.md": STORY,
    "docs/stories/core-45-filters.md": "# CORE-45\n## Acceptance criteria\n- x\n",
    "docs/stories/no-acs.md": "# Notes only\n",
    "apps/api/src/visit.spec.ts": 'it("@XYZ-9 AC1 saves", () => {});\n',
  });
  const rows = allStories(root);
  const visits = rows.find((r) => r.story === "docs/stories/visits.md");
  assert.equal(visits.ticket, "XYZ-9");
  assert.equal(visits.covered, 1);
  assert.equal(visits.total, 3);
  assert.equal(rows.find((r) => r.story === "docs/stories/core-45-filters.md").ticket, "CORE-45");
  assert.equal(rows.find((r) => r.story === "docs/stories/no-acs.md").total, 0);

  const summary = join(root, "summary.md");
  execFileSync("node", [SCRIPT, "--root", root, "--all", "--branch", "dev", "--summary", summary]);
  const md = readFileSync(summary, "utf8");
  assert.match(md, /0\/2 stories fully tested/);
  assert.match(md, /\| docs\/stories\/visits\.md \| XYZ-9 \| 1\/3 \|/);
  assert.ok(!md.includes("no-acs.md"), "stories without criteria are left out");
});
