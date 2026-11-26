#!/usr/bin/env node
// On-screen video titles never carry punctuation (Łukasz, 2026-10-03, NEO-204).
// Checks every string in the `const COPY = {...}` block of each video composition
// (apps/pwa/scripts/*video*/**/*.html) or in a titles JSON file.
// An apostrophe inside a word ("patient's") is allowed; . , ; : ! ? … ¡ ¿ are not.
//
//   node infrastructure/scripts/check-video-titles.mjs            # every composition in the repo
//   node infrastructure/scripts/check-video-titles.mjs <file>...  # only these files
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const FORBIDDEN = /[.,;:!?…¡¿]/;

/** Strip markup so `<br>` / `<em>` never count as titles. */
const plain = (s) => s.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ");

/** Every string leaf of a value, with its path (en.patients[1]). */
function* strings(value, path = "") {
  if (typeof value === "string") yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
}

/** The COPY object of a composition page, or the parsed JSON of a titles file. */
export function titlesOf(source, file = "") {
  if (file.endsWith(".json")) return JSON.parse(source);
  const m = source.match(/const COPY = (\{[\s\S]*?\n {2}\});/);
  if (!m) return null;
  return Function(`"use strict"; return (${m[1]});`)();
}

/** [{path, text}] for every title that contains punctuation. */
export function punctuatedTitles(titles) {
  const bad = [];
  for (const [path, text] of strings(titles)) if (FORBIDDEN.test(plain(text))) bad.push({ path, text });
  return bad;
}

function compositions(root) {
  const scripts = join(root, "apps/pwa/scripts");
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "out" || name === "node_modules") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".html")) out.push(p);
    }
  };
  try {
    for (const name of readdirSync(scripts)) if (/video/.test(name)) walk(join(scripts, name));
  } catch {
    // No scripts folder: nothing to check.
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const files = process.argv.length > 2 ? process.argv.slice(2) : compositions(root);
  let failed = 0;
  for (const file of files) {
    const titles = titlesOf(readFileSync(file, "utf8"), file);
    if (!titles) continue;
    for (const { path, text } of punctuatedTitles(titles)) {
      failed++;
      console.log(`${relative(root, file)}: ${path} has punctuation: "${text}"`);
    }
  }
  if (failed) {
    console.log(`${failed} video title(s) with punctuation. Titles are written without . , ; : ! ? (line breaks instead).`);
    process.exit(1);
  }
}
