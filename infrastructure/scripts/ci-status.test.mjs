// node --test infrastructure/scripts/ — the pure parts of ci-status.mjs (NEO-182).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFailures, verdict, commentBody } from "./ci-status.mjs";

// Shape of real `gh run view --log-failed` output (NEO-132, run 36433371204):
// "<job>\t<step>\t<timestamp> " prefix + ANSI colours.
const P = "test\tUNKNOWN STEP\t2026-09-28T14:24:03.5664587Z ";
const PLAYWRIGHT_LOG = [
  `${P}\x1b[31m  2 failed\x1b[39m`,
  `${P}    [chromium] › e2e/form-errors.spec.ts:29:3 › laptop: a field the API rejects is marked in the form `,
  `${P}    [webkit] › e2e/date-field.spec.ts:57:3 › phone: event start is Date | Time on one line `,
  `${P}\x1b[33m  6 skipped\x1b[39m`,
  `${P}\x1b[32m  242 passed (13.7m)\x1b[39m`,
  `${P}##[notice]  2 failed`,
  `${P}   [chromium] › e2e/form-errors.spec.ts:29:3 › laptop: a field the API rejects is marked in the form `,
].join("\n");

const VITEST_LOG = [
  `${P}\x1b[31m FAIL \x1b[39m src/views/PatientQuestionnaireView.spec.ts > PatientQuestionnaireView > resumes a draft`,
  `${P} ✓ src/utils/dateField.spec.ts (15 tests) 12ms`,
].join("\n");

test("parseFailures: Playwright's failed list, deduplicated, without log prefix or colours", () => {
  assert.deepEqual(parseFailures(PLAYWRIGHT_LOG), [
    "[chromium] › e2e/form-errors.spec.ts:29:3 › laptop: a field the API rejects is marked in the form",
    "[webkit] › e2e/date-field.spec.ts:57:3 › phone: event start is Date | Time on one line",
  ]);
});

test("parseFailures: Vitest FAIL lines, passing files ignored", () => {
  assert.deepEqual(parseFailures(VITEST_LOG), [
    "src/views/PatientQuestionnaireView.spec.ts > PatientQuestionnaireView > resumes a draft",
  ]);
});

const run = (sha, status, conclusion, id = 1) => ({ databaseId: id, headSha: sha, status, conclusion, url: `u/${id}` });

test("verdict: no run for the commit yet → none", () => {
  assert.equal(verdict([run("bbb", "completed", "success")], "aaa").state, "none");
});

test("verdict: running → pending; a finished push run still waits for the PR run on the same commit", () => {
  assert.equal(verdict([run("aaa", "in_progress", "")], "aaa").state, "pending");
  assert.equal(verdict([run("aaa", "completed", "success", 2), run("aaa", "queued", "", 1)], "aaa").state, "pending");
});

test("verdict: cancelled twins are ignored; a short sha matches", () => {
  const v = verdict([run("aaa111", "completed", "cancelled", 2), run("aaa111", "completed", "success", 1)], "aaa");
  assert.equal(v.state, "success");
  assert.equal(v.runId, 1);
});

test("verdict: attempts count distinct red commits; exhausted after the original + 2 failed fixes", () => {
  const first = verdict([run("c1", "completed", "failure")], "c1", 2);
  assert.deepEqual([first.state, first.failedRuns, first.exhausted], ["failure", 1, false]);
  const second = verdict([run("c3", "completed", "failure", 3), run("c2", "completed", "failure", 2), run("c1", "completed", "failure", 1)], "c3", 2);
  assert.deepEqual([second.failedRuns, second.exhausted], [3, true]);
  const fixed = verdict([run("c3", "completed", "success", 3), run("c2", "completed", "failure", 2), run("c1", "completed", "failure", 1)], "c3", 2);
  assert.deepEqual([fixed.state, fixed.exhausted], ["success", false]);
});

test("commentBody: marker, failing tests, attempt counter; exhausted says it needs Łukasz", () => {
  const base = { branch: "worker/neo-1-x", sha: "abcdef1234", runUrl: "https://gh/run/1", failures: ["[webkit] › e2e/a.spec.ts:1:1 › t"], failedSteps: [], maxFixAttempts: 2 };
  const body = commentBody({ ...base, failedRuns: 1, exhausted: false });
  assert.match(body, /^<!-- ci-autofix -->/);
  assert.match(body, /- `\[webkit\] › e2e\/a\.spec\.ts:1:1 › t`/);
  assert.match(body, /Fix attempt 1 of 2/);
  assert.match(commentBody({ ...base, failedRuns: 3, exhausted: true }), /Stopped: still red after 2 fix attempt\(s\).*Needs Łukasz/);
});
