#!/usr/bin/env node
// story-coverage — which acceptance criteria of a story have a test (CORE-182).
//
//   node infrastructure/scripts/story-coverage.mjs --branch <branch> [--changed-from origin/dev]
//     → the coverage table of the branch's ticket; exit 1 on a gap (blocking in CI)
//   node infrastructure/scripts/story-coverage.mjs --ticket CORE-182 [--json]
//   node infrastructure/scripts/story-coverage.mjs --all [--summary <file>]
//     → one row per docs/stories/*.md, report only
//
// A story is docs/stories/<ticket>-*.md, or any story whose first heading names the
// ticket. Its criteria are the top-level list items under every heading containing
// "Acceptance", numbered AC1..n in order ("AC7: …" sets the number explicitly).
// A test covers a criterion when its title (or a comment in a test file) carries the tag
// "@<TICKET> AC<n>" — several criteria: "@NEO-9 AC1 AC3". A real-backend e2e is an
// apps/pwa/e2e spec that never loads an /e2e/harness/ page or stubs /api: it clicks through the app
// against the real API and Postgres, which is what proves a feature works, not only that
// it renders.
//
// What a branch needs (needs()): a UI change (.vue/.css/.scss or a view) → a story, every
// criterion tested, and at least one real-backend e2e; an API route or migration → a
// story with every criterion tested; anything else → only "every criterion tested" when
// the ticket has a story. English only (CLAUDE.md). No dependencies beyond Node.

import { readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const STORIES = "docs/stories";
const TEST_DIRS = ["apps", "packages", "infrastructure", ".claude/skills", ".claude/hooks"];
const TEST_FILE = /\.(spec|test)\.(ts|mjs|js)$|\.test\.sh$/;
const TAG = /@([A-Z]{2,10}-\d+)((?:[\s,]+AC\d+)+)/g;
// page.route("**/api/…") answers the API in the browser: the spec never reaches the server.
const STUBBED_API = /\.route\(\s*["'`/][^"'`]*api/;
const UI_SHAPE = /\.(vue|css|scss)$|^apps\/[^/]+\/src\/views\//;
// Same regex as .claude/hooks/lib/change-shape.sh FULL_SHAPE_REGEX.
const FULL_SHAPE = /\.(vue|css|scss)$|^apps\/[^/]+\/src\/(views|routes)\/|^apps\/api\/migrations\//;

export function parseCriteria(md) {
  const out = [];
  let inSection = false;
  let next = 1;
  for (const line of md.split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) { inSection = /acceptance/i.test(heading[1]); continue; }
    if (!inSection) continue;
    const item = line.match(/^(?:[-*]|\d+\.)\s+(?:\[[ xX]\]\s+)?(.*\S)\s*$/);
    if (!item) continue;
    let text = item[1];
    const label = text.match(/^\**AC(\d+)\**[:.)]?\s+(.*)$/);
    if (label) { next = Number(label[1]); text = label[2]; }
    out.push({ id: `AC${next}`, text });
    next += 1;
  }
  return out;
}

function storyFiles(root) {
  try { return readdirSync(join(root, STORIES)).filter((f) => f.endsWith(".md")).sort(); }
  catch { return []; }
}

function firstHeading(md) {
  return (md.split("\n").find((l) => /^#{1,6}\s/.test(l)) || "");
}

/** The ticket a story belongs to: its file-name prefix, else the first id in its first heading. */
function storyTicket(file, md) {
  const byName = file.match(/^([a-z]{2,10})-(\d+)-/i);
  if (byName) return `${byName[1].toUpperCase()}-${byName[2]}`;
  const inHeading = firstHeading(md).match(/\b([A-Z]{2,10}-\d+)\b/);
  return inHeading ? inHeading[1] : null;
}

export function storyForTicket(root, ticket) {
  for (const f of storyFiles(root)) {
    const md = readFileSync(join(root, STORIES, f), "utf8");
    if (storyTicket(f, md) === ticket) return `${STORIES}/${f}`;
  }
  return null;
}

function walk(root, dir, out) {
  let entries = [];
  try { entries = readdirSync(join(root, dir)); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === "worktrees" || name === "local") continue;
    const rel = `${dir}/${name}`;
    let st;
    try { st = statSync(join(root, rel)); } catch { continue; }
    if (st.isDirectory()) walk(root, rel, out);
    else if (TEST_FILE.test(name)) out.push(rel);
  }
  return out;
}

/** Map ticket → AC id → [{file, line, title, realBackend}]. */
export function collectTags(root) {
  const tags = new Map();
  const files = TEST_DIRS.flatMap((d) => walk(root, d, []));
  for (const file of files) {
    const src = readFileSync(join(root, file), "utf8");
    const realBackend = file.startsWith("apps/pwa/e2e/") && !src.includes("/e2e/harness/") && !STUBBED_API.test(src);
    src.split("\n").forEach((text, i) => {
      for (const m of text.matchAll(TAG)) {
        const ticket = m[1];
        if (!tags.has(ticket)) tags.set(ticket, new Map());
        const byAc = tags.get(ticket);
        for (const ac of m[2].match(/AC\d+/g)) {
          if (!byAc.has(ac)) byAc.set(ac, []);
          byAc.get(ac).push({ file, line: i + 1, title: text.trim().slice(0, 140), realBackend });
        }
      }
    });
  }
  return tags;
}

export function needs(changedPaths) {
  const ui = changedPaths.some((p) => UI_SHAPE.test(p));
  const full = changedPaths.some((p) => FULL_SHAPE.test(p));
  return { story: full, e2e: ui };
}

export function coverage(root, ticket, tags = collectTags(root)) {
  const story = storyForTicket(root, ticket);
  const byAc = tags.get(ticket) || new Map();
  const criteria = story
    ? parseCriteria(readFileSync(join(root, story), "utf8")).map((c) => ({ ...c, tests: byAc.get(c.id) || [] }))
    : [];
  const uncovered = criteria.filter((c) => c.tests.length === 0).map((c) => c.id);
  const realBackendE2e = new Set([...byAc.values()].flat().filter((t) => t.realBackend).map((t) => t.file)).size;
  return {
    ticket, story, criteria, uncovered, realBackendE2e,
    problems(need) {
      const p = [];
      if (!story) {
        if (need.story) p.push(`${ticket} has no story in ${STORIES}/ (name it ${ticket.toLowerCase()}-<slug>.md, or put ${ticket} in its first heading). Run /enrich-user-story: its Acceptance Criteria become the tests.`);
        return p;
      }
      if (criteria.length === 0) p.push(`${story} has no list items under an "Acceptance" heading.`);
      if (uncovered.length) p.push(`${ticket}: ${uncovered.join(", ")} of ${story} have no test. Tag the test that proves each one "@${ticket} ACn" in its title.`);
      if (need.e2e && realBackendE2e === 0) p.push(`${ticket} changes UI but no real-backend e2e (apps/pwa/e2e spec that clicks through the app, not a harness page) is tagged @${ticket}. Add one that walks the user's path and checks the result after a reload.`);
      return p;
    },
  };
}

export function allStories(root, tags = collectTags(root)) {
  return storyFiles(root).map((f) => {
    const md = readFileSync(join(root, STORIES, f), "utf8");
    const ticket = storyTicket(f, md);
    const acs = parseCriteria(md);
    const byAc = (ticket && tags.get(ticket)) || new Map();
    return { story: `${STORIES}/${f}`, ticket, total: acs.length, covered: acs.filter((a) => byAc.has(a.id)).length };
  });
}

export function ticketOf(root, branch) {
  let keys = ["NEO", "CORE", "AJM"];
  try {
    keys = readFileSync(join(root, ".claude/ticket-teams"), "utf8").split("\n").map((l) => l.trim()).filter((l) => /^[A-Z]+$/.test(l));
  } catch { /* defaults */ }
  const m = branch.match(new RegExp(`(?:^|[^a-z0-9])(${keys.join("|")})-(\\d+)`, "i"));
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

export function table(c) {
  const rows = c.criteria.map((a) => {
    const where = a.tests.length ? a.tests.map((t) => `${t.file}:${t.line}${t.realBackend ? " (e2e)" : ""}`).join("<br>") : "**no test**";
    return `| ${a.id} | ${a.text.replace(/\|/g, "\\|")} | ${where} |`;
  });
  return [`### ${c.ticket} — ${c.story}`, "", "| AC | Criterion | Tests |", "|---|---|---|", ...rows].join("\n");
}

function changedSince(root, ref) {
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", ref], { cwd: root, encoding: "utf8" }).trim();
    return execFileSync("git", ["diff", "--name-only", base, "HEAD"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch { return []; }
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const root = resolve(arg("--root") || join(dirname(fileURLToPath(import.meta.url)), "../.."));
  const summary = arg("--summary");
  const tags = collectTags(root);
  const out = [];

  if (argv.includes("--all")) {
    const rows = allStories(root, tags).filter((r) => r.total > 0);
    const full = rows.filter((r) => r.covered === r.total).length;
    out.push(`## Story coverage — ${full}/${rows.length} stories fully tested`, "", "| Story | Ticket | Covered |", "|---|---|---|",
      ...rows.map((r) => `| ${r.story} | ${r.ticket || "—"} | ${r.covered}/${r.total} |`));
  }

  const ticket = arg("--ticket") || (arg("--branch") ? ticketOf(root, arg("--branch")) : null);
  let problems = [];
  if (ticket) {
    const changed = arg("--changed-from") ? changedSince(root, arg("--changed-from")) : [];
    const need = needs(changed);
    if (argv.includes("--require-story")) need.story = true;
    if (argv.includes("--require-e2e")) need.e2e = true;
    const c = coverage(root, ticket, tags);
    problems = c.problems(need);
    if (argv.includes("--json")) {
      process.stdout.write(JSON.stringify({ ticket, story: c.story, criteria: c.criteria, uncovered: c.uncovered, realBackendE2e: c.realBackendE2e, problems }, null, 2) + "\n");
      return problems.length ? 1 : 0;
    }
    if (c.story) out.unshift(table(c), "");
    if (problems.length) out.unshift("Story coverage gaps (CORE-182):", ...problems.map((p) => `- ${p}`), "");
  }

  const text = out.join("\n");
  if (text) process.stdout.write(text + "\n");
  if (summary && text) (existsSync(summary) ? appendFileSync : writeFileSync)(summary, text + "\n");
  return problems.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
