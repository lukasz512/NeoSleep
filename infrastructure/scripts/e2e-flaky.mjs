#!/usr/bin/env node
// e2e-flaky — lists e2e tests that passed only on a retry (CORE-152).
//
//   node infrastructure/scripts/e2e-flaky.mjs apps/pwa/e2e-report.json
//     → one ::warning per flaky test + a section in $GITHUB_STEP_SUMMARY; exit 0
//
// CI retries a failed e2e test once, so a flaky test turns the run green and nobody
// sees it. This makes every such test visible without failing the build.
// English only (CLAUDE.md). No dependencies beyond Node.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Flaky tests in a Playwright JSON report: "<file> › <title> [<project>]". */
export function flakyTests(report) {
  const out = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.status === "flaky") out.push(`${spec.file ?? suite.file} › ${[...titles, spec.title].join(" › ")} [${t.projectName}]`);
      }
    }
    for (const child of suite.suites ?? []) walk(child, child.title && child.title !== child.file ? [...titles, child.title] : titles);
  };
  for (const s of report.suites ?? []) walk(s, []);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.log("e2e-flaky: no report, nothing to check");
    process.exit(0);
  }
  const flaky = flakyTests(JSON.parse(readFileSync(file, "utf-8")));
  for (const t of flaky) console.log(`::warning title=Flaky e2e test::${t} passed only on a retry`);
  console.log(`e2e-flaky: ${flaky.length} flaky test(s)`);
  if (flaky.length && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Flaky e2e tests (passed only on a retry)\n\n${flaky.map((t) => `- ${t}`).join("\n")}\n`);
  }
}
