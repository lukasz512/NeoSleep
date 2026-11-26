#!/usr/bin/env node
// ci-scope — what the CI `test` job runs for this event (CORE-152, decisions ci-tests-r1).
//
//   node infrastructure/scripts/ci-scope.mjs   (in CI; reads GITHUB_* env, writes $GITHUB_OUTPUT)
//     → run_app=true|false, mirror=true|false, browsers="chromium …", e2e_specs="e2e/x.spec.ts …"
//       (empty e2e_specs = every spec), reason="…" (also printed, so the log says why)
//
// - Promote PR (head dev): runs nothing itself; the job waits for the dev push run of
//   the same commit and copies its result, so prod only gets a fully tested commit (D2).
// - Nightly / manual run: everything on Chromium, Firefox and WebKit (D1).
// - dev / prod push, other PRs (renovate): everything on Chromium + WebKit.
// - Work branch push: docs/.md/.claude-only → no app tests. Shared code (UI kit, brand,
//   layouts, router, styles, build config, lockfile, workflows) → every spec on Chromium.
//   Otherwise only the specs related to the change + auth.spec, on Chromium (D3).
// English only (CLAUDE.md). No dependencies beyond Node.

import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { relatedSpecs } from "./related-e2e.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const E2E = "apps/pwa/e2e";
const ALL_BROWSERS = "chromium firefox webkit";
const MERGE_BROWSERS = "chromium webkit";

const DOCS_ONLY = /^(docs\/|\.claude\/|[^/]+\.md$|.*\/[^/]+\.md$)/;
const SHARED = new RegExp(
  "^(" +
    [
      "packages/(ui|brand|i18n|stores|vuetify)/",
      "apps/pwa/src/(layouts|assets|styles|router|plugins|boot)/",
      "apps/pwa/src/(App\\.vue|main\\.ts)$",
      "apps/pwa/(vite\\.config|playwright\\.config|playwright\\.harness\\.config)\\.ts$",
      "apps/pwa/(package\\.json|index\\.html)$",
      "apps/pwa/e2e/global-setup\\.ts$",
      "package\\.json$",
      "pnpm-lock\\.yaml$",
      "\\.nvmrc$",
      "\\.github/workflows/",
    ].join("|") +
    ")"
);
// The CI graph also follows .ts (stores, composables), not only .vue/.css like pre-push.
const SEEDS = /^(apps\/pwa\/src|packages\/ui\/src|apps\/pwa\/e2e\/harness)\/.*\.(vue|css|scss|ts)$/;
const AUTH_SPEC = `${E2E}/auth.spec.ts`;

const isWorkBranch = (ref) => /^(worktree-|worker\/|claude\/)/.test(ref);

/** Specs that hit the real API (not a harness page) — they run when apps/api changes. */
function apiSpecs(root) {
  return readdirSync(join(root, E2E))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => `${E2E}/${f}`)
    .filter((f) => !readFileSync(join(root, f), "utf-8").includes("/e2e/harness/"));
}

/**
 * @param {{event: string, branch: string, headRef?: string, changed: string[], root?: string}} input
 *   branch = the pushed branch (push) or the PR head (pull_request).
 */
export function scope({ event, branch, headRef = "", changed, root = ROOT }) {
  const full = (browsers, reason) => ({ runApp: true, mirror: false, browsers, specs: [], reason });
  if (event === "pull_request" && headRef === "dev") {
    return { runApp: false, mirror: true, browsers: "", specs: [], reason: "promote PR: copies the result of the dev push run of this commit" };
  }
  if (event === "schedule" || event === "workflow_dispatch") return full(ALL_BROWSERS, "nightly/manual: every spec, 3 engines");
  if (event !== "push" || !isWorkBranch(branch)) return full(MERGE_BROWSERS, `${event} ${branch || headRef}: every spec, Chromium + WebKit`);

  if (!changed.length) return full("chromium", "work branch with no diff against dev: every spec, Chromium");
  if (changed.every((f) => DOCS_ONLY.test(f))) {
    return { runApp: false, mirror: false, browsers: "", specs: [], reason: "docs/.claude only: no app tests" };
  }
  const shared = changed.find((f) => SHARED.test(f));
  if (shared) return full("chromium", `shared code changed (${shared}): every spec, Chromium`);

  const specs = new Set([AUTH_SPEC]);
  for (const s of relatedSpecs(changed, { root, seeds: SEEDS })) specs.add(s);
  for (const f of changed) if (f.startsWith(`${E2E}/`) && f.endsWith(".spec.ts")) specs.add(f);
  if (changed.some((f) => f.startsWith("apps/api/"))) for (const s of apiSpecs(root)) specs.add(s);
  const list = [...specs].sort();
  return { runApp: true, mirror: false, browsers: "chromium", specs: list, reason: `work branch: ${list.length} related spec(s), Chromium` };
}

function changedFiles(event, branch) {
  if (event !== "push" || !isWorkBranch(branch)) return [];
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf-8" }).trim();
  const base = git("merge-base", "origin/dev", "HEAD");
  return git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  const headRef = process.env.GITHUB_HEAD_REF ?? "";
  const branch = headRef || process.env.GITHUB_REF_NAME || "";
  const result = scope({ event, branch, headRef, changed: changedFiles(event, branch) });
  const lines = [
    `run_app=${result.runApp}`,
    `mirror=${result.mirror}`,
    `browsers=${result.browsers}`,
    // Playwright filters by path regex relative to apps/pwa.
    `e2e_specs=${result.specs.map((s) => s.replace(/^apps\/pwa\//, "")).join(" ")}`,
    `reason=${result.reason}`,
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}
