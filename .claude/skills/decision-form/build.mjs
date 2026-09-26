#!/usr/bin/env node
// decision-form — renders a questions JSON into a form Artifact. Łukasz ticks
// options, adds notes, presses "Send to Claude"; the page posts the answer sheet
// as an artifact comment via comments.sendToClaude, which wakes the watching
// Claude Code session (NEO-88).
//
//   node .claude/skills/decision-form/build.mjs <questions.json>
//     → validates, writes .claude/local/forms/<id>.html, prints the path
//
// No dependencies beyond Node. English only (CLAUDE.md) — Polish copy lives in the
// questions JSON (its `ui` block overrides the English chrome).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8" }).trim();
  } catch {
    return process.cwd();
  }
})();

const src = process.argv[2];
if (!src) {
  console.error("usage: build.mjs <questions.json>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(resolve(src), "utf-8"));

const errors = [];
const need = (cond, msg) => cond || errors.push(msg);
need(/^[a-z0-9-]{3,60}$/.test(data.id ?? ""), "id: kebab-case, 3-60 chars (also the localStorage key)");
need(typeof data.title === "string" && data.title.length <= 60, "title: required, ≤ 60 chars");
need(!data.summary || data.summary.length <= 320, "summary: ≤ 320 chars");
need(Array.isArray(data.sections) && data.sections.length > 0, "sections: at least one");
const ids = new Set();
for (const s of data.sections ?? []) {
  need(typeof s.title === "string", "section.title required");
  for (const q of s.questions ?? []) {
    need(/^[A-Za-z0-9.-]{1,8}$/.test(q.id ?? ""), `question id "${q.id}": 1-8 chars, letters/digits`);
    need(!ids.has(q.id), `duplicate question id ${q.id}`);
    ids.add(q.id);
    need(typeof q.text === "string" && q.text.length <= 240, `${q.id}: text required, ≤ 240 chars`);
    need(!q.short || q.short.length <= 50, `${q.id}: short ≤ 50 chars (goes into the answer sheet)`);
    need(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6, `${q.id}: 2-6 options`);
    const oids = new Set();
    for (const o of q.options ?? []) {
      need(/^[a-z]$/.test(o.id ?? ""), `${q.id}: option ids are single letters a-z`);
      need(!oids.has(o.id), `${q.id}: duplicate option ${o.id}`);
      oids.add(o.id);
      need(typeof o.label === "string" && o.label.length <= 90, `${q.id}/${o.id}: label required, ≤ 90 chars`);
      need(!o.detail || o.detail.length <= 220, `${q.id}/${o.id}: detail ≤ 220 chars`);
    }
    need((q.options ?? []).filter((o) => o.recommended).length <= 1 || q.multi, `${q.id}: at most one recommended option`);
  }
}
if (errors.length) {
  console.error("questions JSON rejected:\n- " + errors.join("\n- "));
  process.exit(1);
}

// Safe inside <script type="application/json">: nothing can close the tag.
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = readFileSync(join(HERE, "template.html"), "utf-8")
  .replace("{{TITLE}}", esc(data.title))
  .replace("{{DATA}}", () => json);

const outDir = join(ROOT, ".claude/local/forms");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${data.id}.html`);
writeFileSync(out, html);
console.log(out);
console.log(`${ids.size} questions. Publish with capabilities {"comments": {}}.`);
