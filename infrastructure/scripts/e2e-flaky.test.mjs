// e2e-flaky — tests that passed only on a retry (CORE-152).
import { test } from "node:test";
import assert from "node:assert/strict";
import { flakyTests } from "./e2e-flaky.mjs";

test("lists only flaky tests, with file, describe titles and browser", () => {
  const report = {
    suites: [
      {
        title: "calendar.spec.ts",
        file: "calendar.spec.ts",
        specs: [{ title: "opens a visit", file: "calendar.spec.ts", tests: [{ status: "flaky", projectName: "webkit" }, { status: "expected", projectName: "chromium" }] }],
        suites: [
          {
            title: "week view",
            file: "calendar.spec.ts",
            specs: [
              { title: "drags", file: "calendar.spec.ts", tests: [{ status: "expected", projectName: "chromium" }] },
              { title: "scrolls", file: "calendar.spec.ts", tests: [{ status: "flaky", projectName: "chromium" }] },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(flakyTests(report), [
    "calendar.spec.ts › opens a visit [webkit]",
    "calendar.spec.ts › week view › scrolls [chromium]",
  ]);
  assert.deepEqual(flakyTests({ suites: [] }), []);
});
