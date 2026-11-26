#!/usr/bin/env node
// Post-merge smoke check against a deployed PWA (default: pwa-dev).
//
// Crawls the deployed index.html and every JS/CSS chunk it (transitively)
// references, then looks for markers — plain strings that only exist in the
// new code — so "is my merged change actually live?" gets a yes/no without
// logging in. Markers come from the caller, one per --marker flag or from a
// JSON file: [{"label": "...", "text": "..."}]. Exit 1 when any marker is
// missing or the site/chunks don't load.
//
// Usage:
//   node infrastructure/scripts/smoke-dev-bundle.mjs \
//     --url https://pwa-dev.neosleepcare.com \
//     --marker "tooth icon=M12 4.1C10.3 4.1" --marker "doctor badge=app-avatar__badge"
//   node infrastructure/scripts/smoke-dev-bundle.mjs --markers .claude/local/smoke/NEO-57.json

import fs from "node:fs";

const args = process.argv.slice(2);
let base = "https://pwa-dev.neosleepcare.com";
const markers = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url") base = args[++i].replace(/\/$/, "");
  else if (args[i] === "--marker") {
    const raw = args[++i];
    const eq = raw.indexOf("=");
    markers.push(eq > 0 ? { label: raw.slice(0, eq), text: raw.slice(eq + 1) } : { label: raw, text: raw });
  } else if (args[i] === "--markers") {
    // Either a plain [{label,text}] array, or an Artifact marker file carrying "smokeMarkers".
    const parsed = JSON.parse(fs.readFileSync(args[++i], "utf8"));
    markers.push(...(Array.isArray(parsed) ? parsed : parsed.smokeMarkers ?? []));
  }
}
if (markers.length === 0) {
  console.error("No markers given (--marker label=text or --markers file.json).");
  process.exit(2);
}

async function get(path) {
  const res = await fetch(new URL(path, base + "/"), { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.text();
}

const seen = new Set();
const texts = [];
async function crawl(path) {
  if (seen.has(path)) return;
  seen.add(path);
  const body = await get(path);
  texts.push(body);
  // Vite emits chunk references as "assets/<name>-<hash>.js|css", with or without a leading slash.
  for (const m of body.matchAll(/["'(/]((?:\.\/)?assets\/[\w.-]+\.(?:js|css))/g)) {
    await crawl(m[1].replace(/^\.\//, ""));
  }
}

try {
  await crawl("index.html");
} catch (e) {
  console.error(`FAIL: couldn't load ${base}: ${e.message}`);
  process.exit(1);
}

const all = texts.join("\n");
let missing = 0;
for (const { label, text } of markers) {
  const ok = all.includes(text);
  if (!ok) missing++;
  console.log(`${ok ? "OK  " : "MISS"}  ${label}`);
}
console.log(`\n${base} — ${seen.size} files scanned, ${markers.length - missing}/${markers.length} markers found.`);
process.exit(missing ? 1 : 0);
