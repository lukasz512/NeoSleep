#!/usr/bin/env node
// flake-report — failure rate per test and engine from a Playwright JSON report (CORE-58).
//
//   node infrastructure/scripts/flake-report.mjs flake-hunt.json   → markdown table
//
// Used by .github/workflows/e2e-flake-hunt.yml for the job summary. Skipped results don't
// count as runs; failed, timedOut and interrupted count as failures.
// English only (CLAUDE.md). No dependencies beyond Node.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FAILED = new Set(["failed", "timedOut", "interrupted"]);

/** @returns {{test: string, project: string, runs: number, failures: number}[]} worst first */
export function flakeRows(report) {
  const rows = new Map();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const name = `${spec.file}:${spec.line} › ${spec.title}`;
      for (const t of spec.tests ?? []) {
        const key = `${name}\u0000${t.projectName}`;
        const row = rows.get(key) ?? { test: name, project: t.projectName, runs: 0, failures: 0 };
        for (const r of t.results ?? []) {
          if (r.status === "skipped") continue;
          row.runs += 1;
          if (FAILED.has(r.status)) row.failures += 1;
        }
        rows.set(key, row);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return [...rows.values()].sort((a, b) => b.failures / (b.runs || 1) - a.failures / (a.runs || 1) || a.test.localeCompare(b.test));
}

export function flakeMarkdown(rows) {
  const runs = rows.reduce((n, r) => n + r.runs, 0);
  const failing = rows.filter((r) => r.failures > 0);
  if (!failing.length) return `### Flake hunt\n\nNo failures: ${runs} runs across ${rows.length} test × engine pairs.\n`;
  const lines = failing.map((r) => `| ${r.test} | ${r.project} | ${r.failures} / ${r.runs} | ${Math.round((100 * r.failures) / r.runs)}% |`);
  return `### Flake hunt\n\n${failing.length} of ${rows.length} test × engine pairs failed at least once (${runs} runs).\n\n| Test | Engine | Failed | Rate |\n|---|---|---|---|\n${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) throw new Error("usage: flake-report.mjs <playwright-report.json>");
  let report;
  try {
    report = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    process.stdout.write(`### Flake hunt\n\nNo report at ${file} (the run stopped before Playwright wrote it).\n`);
    process.exit(0);
  }
  process.stdout.write(flakeMarkdown(flakeRows(report)));
}
