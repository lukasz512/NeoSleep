// Bundle smoke against a local fake deploy (CORE-297). Run: node --test infrastructure/scripts/smoke-dev-bundle.test.mjs
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "smoke-dev-bundle.mjs");
const FILES = {
  "/index.html": '<script type="module" src="/assets/index-abc123.js"></script>',
  "/assets/index-abc123.js": 'const a={"data-testid":"work-review-waiting"};t("workBoard.backlog.later");',
};

let server;
let url;
before(async () => {
  server = createServer((req, res) => {
    const body = FILES[req.url];
    res.writeHead(body ? 200 : 404).end(body ?? "");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const run = (...args) =>
  new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, "--url", url, ...args], (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });

test("markers found in a chunk pass without a hint", async () => {
  const r = await run("--marker", "waiting=work-review-waiting", "--marker", "later=workBoard.backlog.later");
  assert.equal(r.code, 0);
  assert.match(r.stdout, /OK {4}waiting/);
  assert.match(r.stdout, /2\/2 markers found/);
  assert.doesNotMatch(r.stdout + r.stderr, /data-testid/);
});

test("a missing marker fails and says UI copy cannot be a marker", async () => {
  const r = await run("--marker", "copy=Waiting for you");
  assert.equal(r.code, 1);
  assert.match(r.stdout, /MISS {2}copy/);
  assert.match(r.stderr, /UI copy/);
  assert.match(r.stderr, /data-testid/);
  assert.match(r.stderr, /CSS class/);
  assert.match(r.stderr, /i18n key/);
});

test("an Artifact marker file may hold smokeMarkers as a label-to-text object", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "smoke-bundle-")), "marker.json");
  writeFileSync(file, JSON.stringify({ smokeMarkers: { waiting: "work-review-waiting", gone: "no-such-thing" } }));
  const r = await run("--markers", file);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /OK {4}waiting/);
  assert.match(r.stdout, /MISS {2}gone/);
});

test("an Artifact marker file may hold smokeMarkers as a label/text array", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "smoke-bundle-")), "marker.json");
  writeFileSync(file, JSON.stringify({ smokeMarkers: [{ label: "waiting", text: "work-review-waiting" }] }));
  const r = await run("--markers", file);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /1\/1 markers found/);
});
