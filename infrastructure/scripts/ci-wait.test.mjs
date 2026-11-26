// ci-wait's one-wait-per-commit lock (CORE-247). Run: node --test infrastructure/scripts/ci-wait.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, lockFile, releaseLock } from "./ci-wait.mjs";

const fresh = () => lockFile(mkdtempSync(join(tmpdir(), "ci-wait-")), "abc123");

test("the lock file is named after the commit", () => {
  assert.equal(lockFile("/x", "abc123"), "/x/abc123.pid");
});

test("a free lock is taken and records the pid", () => {
  const file = fresh();
  assert.deepEqual(acquireLock(file, { pid: 111 }), { ok: true });
  assert.equal(readFileSync(file, "utf-8").trim(), "111");
});

test("a lock held by a live process is refused and left alone", () => {
  const file = fresh();
  writeFileSync(file, "111\n");
  assert.deepEqual(acquireLock(file, { pid: 222, alive: () => true }), { ok: false, pid: 111 });
  assert.equal(readFileSync(file, "utf-8").trim(), "111");
});

test("a lock left by a dead process is taken over", () => {
  const file = fresh();
  writeFileSync(file, "111\n");
  assert.deepEqual(acquireLock(file, { pid: 222, alive: () => false }), { ok: true });
  assert.equal(readFileSync(file, "utf-8").trim(), "222");
});

test("a garbage lock file is taken over", () => {
  const file = fresh();
  writeFileSync(file, "not a pid");
  assert.deepEqual(acquireLock(file, { pid: 222, alive: () => true }), { ok: true });
});

test("release removes only our own lock", () => {
  const file = fresh();
  writeFileSync(file, "111\n");
  releaseLock(file, 222);
  assert.equal(existsSync(file), true);
  releaseLock(file, 111);
  assert.equal(existsSync(file), false);
});
