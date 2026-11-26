// node --test — flake-report.mjs (CORE-58).
import { test } from "node:test";
import assert from "node:assert/strict";
import { flakeRows, flakeMarkdown } from "./flake-report.mjs";

// Playwright JSON reporter shape: nested suites → specs → tests (one per project) → results
// (one per repeat/retry).
const report = {
  suites: [
    {
      title: "dialog-header.spec.ts",
      file: "dialog-header.spec.ts",
      specs: [
        {
          title: "confirm dialog spacing",
          file: "dialog-header.spec.ts",
          line: 110,
          tests: [
            { projectName: "webkit", results: [{ status: "passed" }, { status: "failed" }, { status: "passed" }] },
            { projectName: "webkit", results: [{ status: "failed" }] },
            { projectName: "chromium", results: [{ status: "passed" }, { status: "passed" }] },
          ],
        },
      ],
      suites: [
        {
          title: "nested",
          specs: [
            {
              title: "stable test",
              file: "dialog-header.spec.ts",
              line: 20,
              tests: [{ projectName: "firefox", results: [{ status: "passed" }, { status: "skipped" }] }],
            },
          ],
        },
      ],
    },
  ],
};

test("counts runs and failures per test and engine, repeats merged, skips ignored", () => {
  const rows = flakeRows(report);
  const webkit = rows.find((r) => r.project === "webkit");
  assert.deepEqual(
    { runs: webkit.runs, failures: webkit.failures, test: webkit.test },
    { runs: 4, failures: 2, test: "dialog-header.spec.ts:110 › confirm dialog spacing" },
  );
  assert.equal(rows.find((r) => r.project === "chromium").failures, 0);
  assert.equal(rows.find((r) => r.project === "firefox").runs, 1);
});

test("failing rows come first; the markdown says clearly when nothing failed", () => {
  const rows = flakeRows(report);
  assert.equal(rows[0].project, "webkit");
  assert.match(flakeMarkdown(rows), /\| dialog-header\.spec\.ts:110 › confirm dialog spacing \| webkit \| 2 \/ 4 \| 50% \|/);
  const clean = flakeRows({ suites: [{ specs: [{ title: "t", file: "a.spec.ts", line: 1, tests: [{ projectName: "webkit", results: [{ status: "passed" }] }] }] }] });
  assert.match(flakeMarkdown(clean), /No failures: 1 runs/);
});

test("timedOut and interrupted count as failures", () => {
  const rows = flakeRows({ suites: [{ specs: [{ title: "t", file: "a.spec.ts", line: 1, tests: [{ projectName: "webkit", results: [{ status: "timedOut" }, { status: "interrupted" }, { status: "passed" }] }] }] }] });
  assert.equal(rows[0].failures, 2);
});
