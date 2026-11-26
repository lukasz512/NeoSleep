#!/usr/bin/env node
// ci-mirror-run — the promote PR's `test` check copies the dev push run of the same
// commit (CORE-152, decision D2: prod only gets a commit whose full run is green).
//
//   SHA=<commit> GH_TOKEN=… GITHUB_REPOSITORY=owner/repo node infrastructure/scripts/ci-mirror-run.mjs
//     → exit 0 when that run succeeded, 1 when it failed, was cancelled or never ran
//
// Polls once a minute for up to MIRROR_MAX_MINUTES (default 45): right after a merge the
// dev run is still going. English only (CLAUDE.md). No dependencies beyond Node.

import { fileURLToPath } from "node:url";

/** The decision for one poll: "wait" | "pass" | "fail:<why>". */
export function verdict(runs) {
  const run = [...runs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!run) return "wait";
  if (run.status !== "completed") return "wait";
  return run.conclusion === "success" ? "pass" : `fail:dev run ${run.html_url} ended ${run.conclusion}`;
}

async function main() {
  const { SHA, GH_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!SHA || !GH_TOKEN || !GITHUB_REPOSITORY) throw new Error("SHA, GH_TOKEN and GITHUB_REPOSITORY are required");
  const maxMinutes = Number(process.env.MIRROR_MAX_MINUTES) || 45;
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?branch=dev&event=push&head_sha=${SHA}&per_page=10`;
  for (let minute = 0; minute <= maxMinutes; minute++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const v = verdict((await res.json()).workflow_runs ?? []);
    if (v === "pass") {
      console.log(`dev run for ${SHA.slice(0, 7)} is green — promote PR passes`);
      return 0;
    }
    if (v.startsWith("fail:")) {
      console.log(`::error::${v.slice(5)} — rerun it on dev, then rerun this check`);
      return 1;
    }
    console.log(`waiting for the dev run of ${SHA.slice(0, 7)} (${minute} min)`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  console.log(`::error::no finished dev run for ${SHA.slice(0, 7)} after ${maxMinutes} min — rerun this check later`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (err) => { console.error(err.message); process.exit(1); });
}
