// node --test — api-deploy-commit.mjs against the real deploy-api.yml and git history (CORE-99).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { apiDeployPaths, apiDeployCommit } from "./api-deploy-commit.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

test("reads the push path filter of deploy-api.yml", () => {
  const paths = apiDeployPaths();
  assert.ok(paths.includes("apps/api/**"), paths.join(", "));
  assert.ok(paths.includes(".github/workflows/deploy-api.yml"));
  assert.ok(paths.every((p) => !p.startsWith('"') && !p.startsWith("-")), "quotes and list markers are stripped");
});

test("parses only the paths list, not the keys around it", () => {
  const yml = [
    "on:",
    "  push:",
    "    branches: [dev, prod]",
    "    paths:",
    '      - "apps/api/**"',
    "      - 'pnpm-lock.yaml'",
    "  workflow_dispatch: {}",
    "concurrency:",
    "  group: x",
  ].join("\n");
  assert.deepEqual(apiDeployPaths(yml), ["apps/api/**", "pnpm-lock.yaml"]);
});

test("a commit that touches no API path maps to the last one that did", () => {
  const head = git("rev-parse", "HEAD");
  const expected = apiDeployCommit(head);
  assert.match(expected, /^[0-9a-f]{40}$/);
  // The expected commit itself touched an API path... A PR merge commit lists no files
  // in a plain `git show`; compare it with its first parent, which is what it brought in.
  // (CI has the full history since CORE-152, so the expected commit is usually a merge.)
  const touched = git("show", "--diff-merges=first-parent", "--name-only", "--format=", expected).split("\n");
  const paths = apiDeployPaths();
  const hit = touched.some((f) => paths.some((p) => (p.endsWith("/**") ? f.startsWith(p.slice(0, -2)) : p.includes("*") ? f.startsWith(p.split("*")[0]) : f === p)));
  assert.ok(hit, `${expected} touched none of: ${paths.join(", ")}`);
  // ...and nothing after it, up to HEAD, did.
  assert.equal(git("log", "--format=%H", `${expected}..${head}`, "--", ...paths), "");
});

test("a PR merge that brings in an API change maps to the merge commit, not the PR commit (CORE-174)", () => {
  const dir = mkdtempSync(join(tmpdir(), "api-deploy-commit-"));
  try {
    const g = (...args) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" }).trim();
    const write = (file, body) => {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), body);
    };
    g("init", "-q", "-b", "dev");
    write("apps/api/a.ts", "1");
    g("add", "-A");
    g("commit", "-qm", "base");
    g("checkout", "-qb", "feature");
    write("apps/api/a.ts", "2");
    g("commit", "-qam", "api change");
    const prCommit = g("rev-parse", "HEAD");
    g("checkout", "-q", "dev");
    g("merge", "-q", "--no-ff", "-m", "Merge pull request", "feature");
    const merge = g("rev-parse", "HEAD");
    write("apps/pwa/b.ts", "x");
    g("add", "-A");
    g("commit", "-qm", "frontend only");

    const got = apiDeployCommit("HEAD", { cwd: dir, paths: ["apps/api/**"] });
    assert.notEqual(got, prCommit, "the PR-side commit is never deployed on its own");
    assert.equal(got, merge);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
