// node --test — api-deploy-commit.mjs against the real deploy-api.yml and git history (CORE-99).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  // The expected commit itself touched an API path...
  const touched = git("show", "--name-only", "--format=", expected).split("\n");
  const paths = apiDeployPaths();
  const hit = touched.some((f) => paths.some((p) => (p.endsWith("/**") ? f.startsWith(p.slice(0, -2)) : p.includes("*") ? f.startsWith(p.split("*")[0]) : f === p)));
  assert.ok(hit, `${expected} touched none of: ${paths.join(", ")}`);
  // ...and nothing after it, up to HEAD, did.
  assert.equal(git("log", "--format=%H", `${expected}..${head}`, "--", ...paths), "");
});
