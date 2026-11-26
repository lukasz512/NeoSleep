// ci-mirror-run — the promote PR copies the dev run of the same commit (CORE-152, D2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./ci-mirror-run.mjs";

const run = (status, conclusion, created_at = "2026-10-06T00:00:00Z") => ({ status, conclusion, created_at, html_url: "https://x/run" });

test("waits while there is no run or it is still going", () => {
  assert.equal(verdict([]), "wait");
  assert.equal(verdict([run("in_progress", null)]), "wait");
  assert.equal(verdict([run("queued", null)]), "wait");
});

test("passes only on a green run; red or cancelled fails", () => {
  assert.equal(verdict([run("completed", "success")]), "pass");
  assert.match(verdict([run("completed", "failure")]), /^fail:.*failure/);
  assert.match(verdict([run("completed", "cancelled")]), /^fail:.*cancelled/);
});

test("the newest run of the commit decides (a rerun after a red one)", () => {
  const runs = [run("completed", "failure", "2026-10-06T00:00:00Z"), run("completed", "success", "2026-10-06T01:00:00Z")];
  assert.equal(verdict(runs), "pass");
});
