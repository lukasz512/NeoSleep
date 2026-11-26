// Repo hygiene (CORE-77): generated build output must never sit next to sources or be committed.
// Run: node --test infrastructure/scripts/repo-hygiene.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => existsSync(join(root, f)));

const SOURCE_ROOTS = /^(apps|packages|clients)\//;
const HAND_WRITTEN_DTS = /(^|\/)(vite-env|env|shims[^/]*|global)\.d\.ts$/;

test("no generated .d.ts is committed next to a source file", () => {
  const offenders = tracked.filter((f) => {
    if (!SOURCE_ROOTS.test(f) || !f.endsWith(".d.ts") || HAND_WRITTEN_DTS.test(f)) return false;
    return true;
  });
  assert.deepEqual(offenders, [], "generated declarations are build output — git rm them");
});

test("no committed .js sibling shadows a .ts source (Vite resolves .js first)", () => {
  const set = new Set(tracked);
  const offenders = tracked.filter(
    (f) => SOURCE_ROOTS.test(f) && f.endsWith(".js") && set.has(f.replace(/\.js$/, ".ts")),
  );
  assert.deepEqual(offenders, []);
});

test("no .DS_Store or i18n script output is committed", () => {
  const offenders = tracked.filter((f) => /(^|\/)\.DS_Store$/.test(f) || /^packages\/i18n\/_/.test(f));
  assert.deepEqual(offenders, []);
});

test("typecheck (tsc -b) writes declarations outside src", () => {
  for (const app of ["apps/pwa", "apps/web"]) {
    const { compilerOptions: o } = JSON.parse(readFileSync(join(root, app, "tsconfig.json"), "utf8"));
    if (!o.emitDeclarationOnly && !o.declaration && !o.composite) continue;
    const out = o.declarationDir ?? o.outDir;
    assert.ok(out, `${app}/tsconfig.json emits declarations but sets no declarationDir/outDir`);
    assert.match(out, /node_modules/, `${app} declarations must land in node_modules, not next to sources`);
  }
});

test("apps/pwa/src root holds only the entry files; everything else lives in a folder (CORE-84)", () => {
  const ROOT_FILES = new Set(["apps/pwa/src/main.ts", "apps/pwa/src/App.vue", "apps/pwa/src/vite-env.d.ts"]);
  const offenders = tracked.filter((f) => /^apps\/pwa\/src\/[^/]+$/.test(f) && !ROOT_FILES.has(f));
  assert.deepEqual(offenders, [], "move these into boot/, config/, router/, styles/ …");
});

test("apps/pwa global stylesheets live in src/styles, assets/ is for images (CORE-84)", () => {
  const offenders = tracked.filter((f) => /^apps\/pwa\/src\/assets\/.*\.s?css$/.test(f));
  assert.deepEqual(offenders, []);
});
