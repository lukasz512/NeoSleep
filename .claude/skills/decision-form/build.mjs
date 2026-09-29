#!/usr/bin/env node
// decision-form — renders a questions JSON into a form Artifact. Every question is
// three buttons (yes · no · expanded variant with a specialist's recommendation,
// CORE-44); "Send to Claude" posts the answer sheet as an artifact comment via
// comments.sendToClaude, which wakes the watching Claude Code session (NEO-88).
//
//   node .claude/skills/decision-form/build.mjs <questions.json>
//     → validates, writes .claude/local/forms/<id>.html, prints the path
//
// The widget itself lives in decisions.mjs (shared with ship-artifact); tests in
// decisions.test.mjs. English only (CLAUDE.md) — Polish copy lives in the JSON `ui`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { validateQuestions, widget } from "./decisions.mjs";

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
if (!/^[a-z0-9-]{3,60}$/.test(data.id ?? "")) errors.push("id: kebab-case, 3-60 chars (also the localStorage key)");
if (typeof data.title !== "string" || data.title.length > 60) errors.push("title: required, ≤ 60 chars");
if (data.summary && data.summary.length > 320) errors.push("summary: ≤ 320 chars");
if (data.sections) errors.push("sections: gone (CORE-44) — use a flat `questions` array, max 5");
if (!Array.isArray(data.questions) || !data.questions.length) errors.push("questions: at least one");
errors.push(...validateQuestions(data.questions ?? []));
for (const d of data.defaults ?? []) {
  if (!d.text || !d.test) errors.push(`defaults: each item needs text + test (the test that proves it): ${JSON.stringify(d).slice(0, 60)}`);
}
if (errors.length) {
  console.error("questions JSON rejected:\n- " + errors.join("\n- "));
  process.exit(1);
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const w = widget(data);
const defaults = data.defaults?.length
  ? `<div class="defaults"><h2>${esc(data.ui?.defaultsTitle ?? "Decided without asking — the test proves it")}</h2><ul>${data.defaults
      .map((d) => `<li>${esc(d.text)} <code>${esc(d.test)}</code></li>`)
      .join("")}</ul></div>`
  : "";
const slots = {
  TITLE: esc(data.title),
  EYEBROW: esc([data.ticket, data.kind].filter(Boolean).join(" · ")),
  SUMMARY: esc(data.summary ?? ""),
  CONTEXT: data.context?.length ? `<ul class="context">${data.context.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : "",
  DEFAULTS: defaults,
  LINKS: (data.links ?? []).map((l) => `<a class="btn" href="${esc(l.url)}">${esc(l.label)}</a>`).join(""),
  WIDGET_CSS: w.css,
  WIDGET_HTML: w.html,
  WIDGET_SCRIPT: w.script,
};
// split/join, not String.replace: replacement text may contain "$&"-style sequences.
const html = Object.entries(slots).reduce(
  (page, [key, value]) => page.split(`{{${key}}}`).join(value),
  readFileSync(join(HERE, "template.html"), "utf-8")
);

const outDir = join(ROOT, ".claude/local/forms");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${data.id}.html`);
writeFileSync(out, html);
console.log(out);
console.log(`${data.questions.length} questions. Publish with capabilities {"comments": {}}.`);
