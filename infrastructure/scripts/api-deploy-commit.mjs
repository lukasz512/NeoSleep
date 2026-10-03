#!/usr/bin/env node
// Which commit should the dev API be serving after a push? (CORE-99)
//
// deploy-api.yml only runs when its push path filter matches, so after a
// frontend-only merge the API keeps serving the last commit that touched one
// of those paths. post-deploy-smoke.yml waits for that commit, not github.sha.
// The path list is read from deploy-api.yml itself, so the two never drift.
//
// Usage: node infrastructure/scripts/api-deploy-commit.mjs [<sha>]   (default HEAD)
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEPLOY_API = fileURLToPath(new URL("../../.github/workflows/deploy-api.yml", import.meta.url));

/** The `on.push.paths` list of deploy-api.yml (no YAML dependency: the list is plain `- "x"` lines). */
export function apiDeployPaths(yml = readFileSync(DEPLOY_API, "utf8")) {
  const lines = yml.split("\n");
  const start = lines.findIndex((l) => /^\s+paths:\s*$/.test(l));
  if (start < 0) throw new Error("deploy-api.yml has no push paths filter");
  const paths = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^\s+-\s+["']?([^"']+)["']?\s*$/.exec(line);
    if (!m) break;
    paths.push(m[1]);
  }
  return paths;
}

/** The newest commit at or before `sha` that would have triggered deploy-api.yml. */
export function apiDeployCommit(sha = "HEAD") {
  return execFileSync("git", ["log", "-1", "--format=%H", sha, "--", ...apiDeployPaths()], { encoding: "utf8" }).trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const commit = apiDeployCommit(process.argv[2]);
  if (!commit) {
    console.error("No commit in history touches the deploy-api.yml paths — is the clone shallow?");
    process.exit(1);
  }
  console.log(commit);
}
