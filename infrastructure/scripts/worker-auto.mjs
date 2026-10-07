#!/usr/bin/env node
// worker-auto — the deterministic parts of linear-worker's queue (CORE-183).
//
//   node infrastructure/scripts/worker-auto.mjs pick <issues.json>
//     → prints {"identifier","mode"} of the ticket to take, or nothing when the queue is empty
//       (issues.json: [{identifier, createdAt, state, labels: [name…]}] from Linear)
//   node infrastructure/scripts/worker-auto.mjs guard [--base origin/dev]
//     → exit 0 when the branch's diff is "light"; exit 1 and print the Linear comment when it
//       touches UI, a view, an API route or a migration (an `auto` ticket must not)
//   node infrastructure/scripts/worker-auto.mjs dry-run <issues.json> [changed paths…]
//     → the steps the worker would take, as JSON (nothing is touched)
//
// Queue: `ci-failed` first (CI-fix mode), then FIFO by createdAt over "Ready for Worker"
// tickets and `auto`-labelled tickets still in Backlog/Todo. An `auto` ticket is routine,
// non-UI work Łukasz hands off so it doesn't run in his interactive session; it ends with
// the light handover (one Linear comment with the PR link), never an Artifact page.
// The shape rule is read from .claude/hooks/lib/change-shape.sh, so hooks and worker agree.
// English only (CLAUDE.md). No dependencies beyond Node.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const AUTO_STATES = ["backlog", "todo"];
const READY_STATE = "ready for worker";

function fullShape() {
  const sh = readFileSync(join(ROOT, ".claude/hooks/lib/change-shape.sh"), "utf8");
  const m = sh.match(/^FULL_SHAPE_REGEX='([^']+)'/m);
  if (!m) throw new Error("FULL_SHAPE_REGEX not found in .claude/hooks/lib/change-shape.sh");
  return new RegExp(m[1]);
}

const has = (issue, label) => (issue.labels ?? []).some((l) => String(l).toLowerCase() === label);
const byAge = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));

export function pick(issues) {
  const open = issues.filter((i) => !["done", "canceled", "cancelled", "duplicate"].includes(String(i.state).toLowerCase()));
  const ciFailed = open.filter((i) => has(i, "ci-failed")).sort(byAge)[0];
  if (ciFailed) return { identifier: ciFailed.identifier, mode: "ci-fix" };
  const next = open
    .filter((i) => {
      const state = String(i.state).toLowerCase();
      return state === READY_STATE || (has(i, "auto") && AUTO_STATES.includes(state));
    })
    .sort(byAge)[0];
  if (!next) return null;
  return { identifier: next.identifier, mode: String(next.state).toLowerCase() === READY_STATE && !has(next, "auto") ? "ready" : "auto" };
}

export function guard(changedPaths) {
  const re = fullShape();
  const offending = changedPaths.filter((p) => re.test(p));
  if (!offending.length) return { ok: true, shape: "light" };
  return {
    ok: false,
    shape: "full",
    offending,
    comment: [
      "Worker stopped: this `auto` ticket needs a UI/feature change, which the worker doesn't ship (CORE-183).",
      `The implementation touched: ${offending.map((p) => `\`${p}\``).join(", ")}.`,
      "Nothing was pushed. I removed the `auto` label and moved the ticket back to Todo, so it runs in an interactive session, where the full Artifact (before/after) is built.",
    ].join("\n"),
  };
}

const slug = (s) => String(s || "auto").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "auto";

export function dryRun(issues, changedPaths) {
  const picked = pick(issues);
  if (!picked) return { ticket: null, steps: [] };
  const issue = issues.find((i) => i.identifier === picked.identifier);
  const branch = `worker/${picked.identifier.toLowerCase()}-${slug(issue.title)}`;
  if (picked.mode === "ci-fix") {
    return { ticket: picked.identifier, mode: picked.mode, steps: [{ do: "claim" }, { do: "ci-fix", rules: ".claude/ci-autofix.json" }] };
  }
  const steps = [{ do: "claim", to: "Worker: In Progress" }, { do: "scope-check" }];
  if (picked.mode === "ready") steps.push({ do: "enrich" });
  steps.push({ do: "implement" }, { do: "self-check" });
  if (picked.mode === "auto") {
    const g = guard(changedPaths);
    steps.push({ do: "guard", shape: g.shape });
    if (!g.ok) {
      steps.push({ do: "reset" }, { do: "comment", text: g.comment }, { do: "remove-label", label: "auto" }, { do: "state", to: "Todo" });
      return { ticket: picked.identifier, mode: picked.mode, steps };
    }
    steps.push({ do: "push", branch }, { do: "ci-wait" }, { do: "light-handover", cmd: "node .claude/skills/ship-artifact/build.mjs light --linear-commented --linear-status \"Needs Review\"" });
  } else {
    steps.push({ do: "push", branch }, { do: "ci-wait" }, { do: "artifact" });
  }
  steps.push({ do: "comment", text: "2 sentences + compare URL + branch" }, { do: "state", to: "Needs Review" });
  return { ticket: picked.identifier, mode: picked.mode, steps };
}

function changedSince(base) {
  try {
    const mb = execFileSync("git", ["merge-base", "HEAD", base], { encoding: "utf8" }).trim();
    const committed = execFileSync("git", ["diff", "--name-only", mb, "HEAD"], { encoding: "utf8" });
    const working = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" });
    return [...new Set(`${committed}\n${working}`.split("\n").filter(Boolean))];
  } catch { return []; }
}

function main([cmd, ...rest]) {
  const arg = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  if (cmd === "pick") {
    const p = pick(JSON.parse(readFileSync(rest[0], "utf8")));
    if (p) console.log(JSON.stringify(p));
    return 0;
  }
  if (cmd === "guard") {
    const g = guard(changedSince(arg("--base") ?? "origin/dev"));
    console.log(g.ok ? "light" : g.comment);
    return g.ok ? 0 : 1;
  }
  if (cmd === "dry-run") {
    console.log(JSON.stringify(dryRun(JSON.parse(readFileSync(rest[0], "utf8")), rest.slice(1)), null, 2));
    return 0;
  }
  console.error("usage: worker-auto.mjs pick <issues.json> | guard [--base origin/dev] | dry-run <issues.json> [paths…]");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
