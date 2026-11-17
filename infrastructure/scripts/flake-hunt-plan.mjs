#!/usr/bin/env node
// flake-hunt-plan — what one flake hunt run tests (CORE-58).
//
//   node infrastructure/scripts/flake-hunt-plan.mjs   → specs, repeat, browsers in $GITHUB_OUTPUT
//
// Used by .github/workflows/e2e-flake-hunt.yml. env: EVENT (github.event_name) and, for a
// manual run, INPUT_SPECS / INPUT_REPEAT / INPUT_BROWSERS. A push run diffs against origin/dev.
// English only (CLAUDE.md). No dependencies beyond Node.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENGINES = ["chromium", "firefox", "webkit"];
const MAX_REPEAT = 50;

/** @returns {{specs: string, repeat: number, browsers: string}} specs "" = the whole suite */
export function huntPlan({ event, changed = [], inputs = {} }) {
  if (event === "push") {
    const specs = changed.filter((f) => /^apps\/pwa\/e2e\/[^/]+\.spec\.ts$/.test(f)).map((f) => f.replace(/^apps\/pwa\//, ""));
    if (specs.length) return { specs: specs.join(" "), repeat: 20, browsers: ENGINES.join(" ") };
    // Config, a shared helper or the workflow changed: every spec can be affected.
    return { specs: "", repeat: 2, browsers: "webkit" };
  }
  if (event === "workflow_dispatch") {
    const specs = (inputs.specs ?? "").trim().split(/\s+/).filter(Boolean);
    if (specs.some((s) => !/^[\w./-]+$/.test(s))) throw new Error("specs: only spec file paths, space separated");
    const repeat = Number((inputs.repeat ?? "").trim() || 20);
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_REPEAT) throw new Error(`repeat: a whole number from 1 to ${MAX_REPEAT}`);
    const browsers = (inputs.browsers ?? "").trim().split(/\s+/).filter(Boolean);
    if (browsers.some((b) => !ENGINES.includes(b))) throw new Error(`browsers: any of ${ENGINES.join(", ")}`);
    return { specs: specs.join(" "), repeat, browsers: browsers.join(" ") || "webkit" };
  }
  // Nightly: WebKit is the engine that differs between runner images (CORE-208).
  return { specs: "", repeat: 3, browsers: "webkit" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { EVENT, INPUT_SPECS, INPUT_REPEAT, INPUT_BROWSERS, GITHUB_OUTPUT } = process.env;
  let changed = [];
  if (EVENT === "push") {
    const base = execFileSync("git", ["merge-base", "origin/dev", "HEAD"], { encoding: "utf-8" }).trim();
    changed = execFileSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf-8" }).split("\n").filter(Boolean);
  }
  const plan = huntPlan({ event: EVENT, changed, inputs: { specs: INPUT_SPECS, repeat: INPUT_REPEAT, browsers: INPUT_BROWSERS } });
  console.log(`Hunting: ${plan.specs || "whole suite"} × ${plan.repeat} on ${plan.browsers}`);
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `specs=${plan.specs}\nrepeat=${plan.repeat}\nbrowsers=${plan.browsers}\n`);
}
