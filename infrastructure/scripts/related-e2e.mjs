#!/usr/bin/env node
// related-e2e — which apps/pwa e2e specs a UI change can break (NEO-182, pre-push).
//
//   git diff --name-only … | node infrastructure/scripts/related-e2e.mjs
//     → prints apps/pwa/e2e/<spec>.spec.ts paths, one per line
//
// Only harness specs (they load /e2e/harness/*.html — no API, no DB) are picked:
// those run in a minute on any machine; the rest stays with CI. A spec is related
// when it — or the harness page it loads — imports a changed .vue/.css/.scss file,
// directly or through up to MAX_DEPTH levels of importers. A change to a global
// stylesheet (src/assets, packages/brand) relates to every harness spec.
// English only (CLAUDE.md). No dependencies beyond Node.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const E2E = "apps/pwa/e2e";
const SOURCE_DIRS = ["apps/pwa/src", "packages/ui/src", `${E2E}/harness`];
const MAX_DEPTH = 5;
const UI = /\.(vue|css|scss)$/;
const GLOBAL_STYLE = /^(apps\/pwa\/src\/(assets|styles)\/|packages\/brand\/)/;

function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(vue|ts|mjs|js)$/.test(name) && !/\.(spec|test)\./.test(name)) out.push(rel);
  }
  return out;
}

/**
 * Static runtime import specifiers of a file: `import … from "x"` and side-effect
 * `import "x"`. Dropped on purpose, or one component links to the whole app:
 * type-only imports (types/formField.ts `import type AppIcon from "…vue"`) and lazy
 * `import("x")` — router/routes.ts lazy-loads every view, and a harness page that
 * imports the routes table never renders them.
 */
function importsOf(text) {
  const runtime = text.replace(/^\s*(?:import|export)\s+type\s[\s\S]*?from\s+["'][^"']+["'];?/gm, "");
  return [...runtime.matchAll(/(?:from\s+|^\s*import\s+)["']([^"']+)["']/gm)].map((m) => m[1]);
}

/** Does `spec` (an import specifier) plausibly point at `target` (a repo path)? */
function pointsAt(spec, target) {
  const name = basename(target, extname(target));
  const last = spec.split("/").pop() ?? "";
  return last === basename(target) || last === name || (name === "index" && spec.endsWith(basename(dirname(target))));
}

export function relatedSpecs(changed, { root = ROOT } = {}) {
  const ui = changed.filter((f) => UI.test(f));
  if (!ui.length) return [];
  const specs = readdirSync(join(root, E2E))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => `${E2E}/${f}`)
    .filter((f) => readFileSync(join(root, f), "utf-8").includes("/e2e/harness/"));
  if (ui.some((f) => GLOBAL_STYLE.test(f))) return specs;

  const files = SOURCE_DIRS.flatMap((d) => walk(d));
  const importsByFile = new Map(files.map((f) => [f, importsOf(readFileSync(join(root, f), "utf-8"))]));
  // Closure: the changed files plus everything that imports them, up to MAX_DEPTH levels.
  const reached = new Set(ui);
  let frontier = ui;
  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const next = [];
    for (const [file, imports] of importsByFile) {
      if (reached.has(file)) continue;
      if (imports.some((spec) => frontier.some((t) => pointsAt(spec, t)))) {
        reached.add(file);
        next.push(file);
      }
    }
    frontier = next;
  }
  const harnessPages = [...reached].filter((f) => f.startsWith(`${E2E}/harness/`)).map((f) => basename(f, extname(f)));
  return specs.filter((spec) => {
    const text = readFileSync(join(root, spec), "utf-8");
    return harnessPages.some((page) => text.includes(`/e2e/harness/${page}.html`));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const changed = readFileSync(0, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean)
    .map((f) => relative(ROOT, resolve(ROOT, f)));
  for (const spec of relatedSpecs(changed)) console.log(spec);
}
