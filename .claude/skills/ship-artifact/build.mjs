#!/usr/bin/env node
// ship-artifact — renders the per-change Artifact from one template and keeps
// the quality-gate marker in sync. Claude writes only the judgment parts
// (summary, decisions, before/after, verify list) into a content JSON; this
// script gathers everything mechanical from git + env.
//
//   node .claude/skills/ship-artifact/build.mjs render <content.json>
//     → writes the HTML page, prints its path + the Linear comment text
//   node .claude/skills/ship-artifact/build.mjs finalize --url <artifact-url>
//        [--linear-attached] [--linear-commented] [--linear-status "<name>"]
//     → writes .claude/local/artifacts/<TICKET>.json and upserts the artifact index
//   node .claude/skills/ship-artifact/build.mjs index
//     → renders the artifact index page (one line per change), prints its path + URL
//   node .claude/skills/ship-artifact/build.mjs index --published <index-url>
//     → records the index URL and marks this ticket's marker "indexed"
//
// NEO-84 (Łukasz, 2026-09-26): every change has a NEO ticket; every Artifact and ticket
// carries the same 3 links (Artifact, Linear, VS Code session); texts are short — the
// limits below reject padded content instead of rendering it.
//
// No dependencies beyond Node. English only (CLAUDE.md).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const git = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const ROOT = git("rev-parse", "--show-toplevel") || process.cwd();
const BRANCH = git("rev-parse", "--abbrev-ref", "HEAD");
const TICKET_FROM_BRANCH = (BRANCH.match(/\b(neo-\d+)\b/i)?.[1] ?? "").toUpperCase() || null;
const MARKER_DIR = join(ROOT, ".claude/local/artifacts");
const DRAFT = join(MARKER_DIR, ".draft.json");
// The index is shared by every worktree, so it lives in the main checkout's .claude/local.
const COMMON_LOCAL = join(dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir") || join(ROOT, ".git")), ".claude/local");
const INDEX_JSON = join(COMMON_LOCAL, "artifact-index.json");
const INDEX_HTML = join(COMMON_LOCAL, "artifact-index.html");
const INDEX_URL_FILE = join(COMMON_LOCAL, "artifact-index-url.txt");
const SESSION_ID = process.env.CLAUDE_CODE_SESSION_ID ?? "";
const linearUrlOf = (ticket) => `https://linear.app/neosleep/issue/${ticket}`;
const vscodeUrlOf = (id) => `vscode://anthropic.claude-code/open?session=${id}`;

// Short on purpose: Łukasz reads these after every session (NEO-84, "no AI slop").
const LIMITS = {
  headline: 110,
  summaryChars: 320,
  summarySentences: 2,
  prTitle: 80,
  list: { decisions: [4, 220], notes: [4, 220], verify: [8, 160] },
};
const plainText = (html) => String(html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function checkLimits(c) {
  const problems = [];
  const headline = plainText(c.headline);
  if (headline.length > LIMITS.headline) problems.push(`headline is ${headline.length} chars (max ${LIMITS.headline})`);
  const summary = plainText(c.summary);
  if (summary.length > LIMITS.summaryChars) problems.push(`summary is ${summary.length} chars (max ${LIMITS.summaryChars})`);
  const sentences = summary.split(/(?<=[.!?])\s+(?=[A-Z0-9"„(])/).filter(Boolean).length;
  if (sentences > LIMITS.summarySentences) problems.push(`summary has ${sentences} sentences (max ${LIMITS.summarySentences})`);
  if (c.prTitle && plainText(c.prTitle).length > LIMITS.prTitle) problems.push(`prTitle is longer than ${LIMITS.prTitle} chars`);
  for (const [key, [maxItems, maxChars]] of Object.entries(LIMITS.list)) {
    const items = c[key] ?? [];
    if (items.length > maxItems) problems.push(`${key} has ${items.length} items (max ${maxItems})`);
    items.forEach((item, i) => {
      const len = plainText(item).length;
      if (len > maxChars) problems.push(`${key}[${i}] is ${len} chars (max ${maxChars})`);
    });
  }
  if (problems.length) throw new Error(`content too long — cut it down, don't pad it:\n  - ${problems.join("\n  - ")}`);
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function repoSlug() {
  const url = git("remote", "get-url", "origin");
  return url.match(/[:/]([^/:]+\/[^/]+?)(\.git)?$/)?.[1] ?? "";
}

function isPushed() {
  return git("ls-remote", "--heads", "origin", BRANCH) !== "";
}

/** The PR GitHub already has for this branch (open or merged), via gh — null when none
 *  or gh is unavailable. A merged PR's branch is usually deleted, so without this the
 *  page fell back to the "PR link after push" placeholder even though the work shipped. */
function existingPr() {
  try {
    const out = execFileSync("gh", ["pr", "list", "--head", BRANCH, "--state", "all", "--limit", "1", "--json", "number,url,state"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pr = JSON.parse(out)[0];
    if (!pr) return null;
    const state = String(pr.state).toLowerCase();
    // A merged/closed PR only describes this branch if nothing new was committed on top
    // of dev since — otherwise the new commits need a new PR ("Create PR").
    if (state !== "open" && Number(git("rev-list", "--count", "origin/dev..HEAD") || "0") > 0) return null;
    return { number: pr.number, url: pr.url, state };
  } catch {
    return null;
  }
}

function changedFiles() {
  const base = git("merge-base", "HEAD", "origin/dev");
  if (!base) return [];
  const committed = git("diff", "--name-only", `${base}..HEAD`).split("\n");
  const working = git("diff", "--name-only", "HEAD").split("\n");
  return [...new Set([...committed, ...working])].filter(Boolean).sort();
}

function markerPath(ticket) {
  return join(MARKER_DIR, ticket ? `${ticket}.json` : `branch-${BRANCH.replaceAll("/", "-")}.json`);
}

function prUrl(ticket, prTitle, summary) {
  const slug = repoSlug();
  if (!slug || !BRANCH) return null;
  const title = [ticket, prTitle].filter(Boolean).join(" ");
  const plain = summary?.replace(/<[^>]+>/g, "");
  const body = [ticket, plain, "🤖 Generated with [Claude Code](https://claude.com/claude-code)"].filter(Boolean).join("\n\n");
  return `https://github.com/${slug}/compare/dev...${BRANCH}?quick_pull=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

// Content fields are authored by Claude and may carry inline HTML (<b>, <code>);
// only attribute values and file-derived strings get escaped.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function cell(value) {
  if (value && typeof value === "object") {
    return `<span class="pill ${esc(value.status ?? "neutral")}">${value.text ?? ""}</span>${value.note ? ` <span class="muted">${value.note}</span>` : ""}`;
  }
  return value ?? "";
}

function imageTag(img) {
  const src = resolve(ROOT, img.src);
  if (!existsSync(src)) throw new Error(`image not found: ${img.src}`);
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[extname(src).toLowerCase()] ?? "image/png";
  const data = readFileSync(src).toString("base64");
  return `<figure><figcaption>${img.label ?? ""}</figcaption><img src="data:${mime};base64,${data}" alt="${esc(img.alt ?? img.label ?? "")}"></figure>`;
}

function render(contentPath) {
  const c = JSON.parse(readFileSync(contentPath, "utf-8"));
  const ticket = c.ticket === undefined ? TICKET_FROM_BRANCH : c.ticket;
  const files = changedFiles();
  const uiChanged = files.some((f) => /\.(vue|css|scss)$/.test(f));
  if (uiChanged && !(c.images?.length || c.mockupHtml)) {
    throw new Error("UI files changed — add real before/after screenshots (images) or a labeled mockup (mockupHtml).");
  }
  for (const key of ["title", "headline", "summary", "verify"]) {
    if (!c[key] || (Array.isArray(c[key]) && !c[key].length)) throw new Error(`content.${key} is required`);
  }
  if (!ticket) {
    throw new Error("every change needs a NEO ticket (NEO-84): create it in Linear first and work on a branch named after it (worktree-neo-<n>-<slug>)");
  }
  if (!SESSION_ID) throw new Error("CLAUDE_CODE_SESSION_ID is not set — run this from the Claude Code session that made the change (needed for the VS Code link)");
  checkLimits(c);

  const sessionId = SESSION_ID;
  const pushed = isPushed();
  const existing = existingPr();
  const pr = existing?.url ?? (pushed ? prUrl(ticket, c.prTitle ?? c.headline, c.summary) : null);
  const linearUrl = linearUrlOf(ticket);
  // The Artifact's own URL is known from the second render on (finalize stores it).
  const selfUrl = readJson(markerPath(ticket), {}).url ?? null;
  const prLabel = !existing
    ? "Create PR"
    : existing.state === "merged"
      ? `PR #${existing.number} · merged`
      : existing.state === "closed"
        ? `PR #${existing.number} · closed`
        : `Open PR #${existing.number}`;

  // The Artifact renders in a sandboxed iframe; GitHub/Linear refuse to be framed,
  // so every link must open a new tab or the click shows a broken-page icon.
  const ext = `target="_blank" rel="noopener noreferrer"`;
  // Always the same order: PR, then the 3 fixed links (NEO-84) — Artifact, Linear, VS Code.
  const links = [
    pr ? `<a class="btn primary" href="${esc(pr)}" ${ext}>${esc(prLabel)}</a>` :`<span class="btn ghost" title="Branch not pushed yet">PR link after push</span>`,
    selfUrl ? `<a class="btn" href="${esc(selfUrl)}" ${ext}>Artifact</a>` : `<span class="btn ghost" title="Filled in on the next render, after the first publish">Artifact link after publish</span>`,
    `<a class="btn" href="${esc(linearUrl)}" ${ext}>Linear ${esc(ticket)}</a>`,
    `<a class="btn" href="${esc(vscodeUrlOf(sessionId))}" ${ext}>VS Code session</a>`,
  ].join("");

  const decisions = c.decisions?.length
    ? `<div class="decide"><h2>Needs your decision</h2><ol>${c.decisions.map((d) => `<li>${d}</li>`).join("")}</ol></div>`
    : "";

  const ba = c.beforeAfter;
  const table = ba
    ? `${ba.caption ? `<p>${ba.caption}</p>` : ""}<div class="matrix"><table><thead><tr>${(ba.columns ?? ["Case", "Before", "After"]).map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${ba.rows
        .map((r) => `<tr>${r.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`
    : "";
  const images = c.images?.length ? `<div class="shots">${c.images.map(imageTag).join("")}</div>` : "";
  const mockup = c.mockupHtml ? `<div class="mockup"><span class="eyebrow">Mockup — not a live screenshot</span>${c.mockupHtml}</div>` : "";
  const code = c.code ? `<pre>${esc(c.code)}</pre>` : "";
  const notes = (c.notes ?? []).map((n) => `<p class="muted">${n}</p>`).join("");
  const fileList = files.length ? `<details><summary>${files.length} changed file(s)</summary><ul class="files">${files.map((f) => `<li><code>${esc(f)}</code></li>`).join("")}</ul></details>` : "";

  const run = [
    `git fetch origin && git checkout ${BRANCH}`,
    "pnpm install",
    ...(c.runLocally ?? []),
  ];

  const slots = {
    TITLE: esc(c.title),
    LINKS: links,
    RESUME: sessionId ? `<p class="mono muted">claude --resume ${esc(sessionId)}</p>` : "",
    EYEBROW: [ticket, c.kind, c.area].filter(Boolean).map(esc).join(" · "),
    HEADLINE: c.headline,
    SUMMARY: c.summary,
    DECISIONS: decisions,
    WHAT_CHANGED: [table, images, mockup, code, notes, fileList].join("\n"),
    RUN: esc(run.join("\n")),
    RUN_NOTE: c.runNote ? `<p class="muted">${c.runNote}</p>` : "",
    VERIFY: c.verify.map((v) => `<li>${v}</li>`).join(""),
    VERIFY_NOTE: c.verifyNote ? `<p class="muted">${c.verifyNote}</p>` : "",
  };
  // split/join, not String.replace: replacement text may contain "$&"-style sequences.
  const html = Object.entries(slots).reduce(
    (page, [key, value]) => page.split(`{{${key}}}`).join(value),
    readFileSync(join(HERE, "template.html"), "utf-8")
  );

  const out = resolve(c.out ?? join(dirname(resolve(contentPath)), `artifact-${(ticket ?? BRANCH).toLowerCase().replaceAll("/", "-")}.html`));
  writeFileSync(out, html);

  mkdirSync(MARKER_DIR, { recursive: true });
  writeFileSync(
    DRAFT,
    JSON.stringify(
      { ticket, title: c.title, headline: plainText(c.headline), sessionId, prUrl: pr, uiChanged, hoisting: c.hoisting, testCoverageMap: c.testCoverageMap, visualComparison: c.visualComparison },
      null,
      2
    )
  );

  console.log(`page: ${out}`);
  console.log(`marker: ${markerPath(ticket)} (written by finalize)`);
  console.log(
    existing
      ? `PR: #${existing.number} (${existing.state}) — the button links to it`
      : pushed
        ? "pushed: yes — Create PR button is live"
        : "pushed: no — re-run render after push to get the Create PR button"
  );
  if (!selfUrl) console.log("first render: publish, run finalize, then render + republish once so the Artifact link is filled in");
  console.log("\n--- Linear comment (post after publishing, replace <ARTIFACT_URL>) ---");
  console.log(
    [
      plainText(c.summary),
      "",
      `Artifact: ${selfUrl ?? "<ARTIFACT_URL>"}`,
      `Linear: ${linearUrl}`,
      `VS Code: ${vscodeUrlOf(sessionId)}`,
      ...(pr ? [`${prLabel}: ${pr}`] : []),
      `Branch: \`${BRANCH}\``,
    ].join("\n")
  );
}

function finalize(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const url = arg("--url");
  if (!url) throw new Error("--url <artifact url> is required");
  if (!existsSync(DRAFT)) throw new Error("run `render` first");
  const draft = JSON.parse(readFileSync(DRAFT, "utf-8"));
  const path = markerPath(draft.ticket);
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};

  const marker = {
    ...previous,
    url,
    sections: ["summary", "run-locally", "qa-checklist"],
    ...(draft.hoisting ? { hoisting: draft.hoisting } : {}),
    ...(draft.testCoverageMap ? { testCoverageMap: draft.testCoverageMap } : {}),
    ...(draft.uiChanged && draft.visualComparison ? { visualComparison: draft.visualComparison } : {}),
    ...(draft.prUrl ? { prUrl: draft.prUrl } : {}),
    ticket: draft.ticket,
    sessionId: draft.sessionId,
    linearUrl: linearUrlOf(draft.ticket),
    vscodeUrl: vscodeUrlOf(draft.sessionId),
    // Set again by `index --published` once the index page shows this version.
    indexed: false,
  };
  if (draft.ticket) {
    if (argv.includes("--linear-attached")) marker.linearAttached = true;
    if (argv.includes("--linear-commented")) marker.linearCommented = true;
    if (arg("--linear-status")) marker.linearStatus = arg("--linear-status");
  }
  writeFileSync(path, JSON.stringify(marker, null, 2) + "\n");
  console.log(`marker written: ${path}`);

  // One line per ticket in the shared index; a refresh replaces the ticket's line.
  const index = readJson(INDEX_JSON, []).filter((e) => e.ticket !== draft.ticket);
  index.push({
    ticket: draft.ticket,
    title: draft.title,
    headline: draft.headline,
    status: marker.linearStatus ?? previous.linearStatus ?? "In Progress",
    updated: new Date().toISOString(),
    branch: BRANCH,
    artifact: url,
    linear: marker.linearUrl,
    vscode: marker.vscodeUrl,
    pr: marker.prUrl ?? null,
  });
  mkdirSync(COMMON_LOCAL, { recursive: true });
  writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + "\n");
  console.log(`index updated: ${INDEX_JSON} — next: build.mjs index, publish it, build.mjs index --published <url>`);

  const missing = ["linearAttached", "linearCommented", "indexed"].filter((k) => !marker[k]);
  if (missing.length) console.log(`still missing for the quality gate: ${missing.join(", ")}`);
}

function renderIndex(argv) {
  const i = argv.indexOf("--published");
  if (i !== -1) {
    const url = argv[i + 1];
    if (!url) throw new Error("--published <index url> is required");
    mkdirSync(COMMON_LOCAL, { recursive: true });
    writeFileSync(INDEX_URL_FILE, url + "\n");
    if (TICKET_FROM_BRANCH && existsSync(markerPath(TICKET_FROM_BRANCH))) {
      const marker = readJson(markerPath(TICKET_FROM_BRANCH), {});
      marker.indexed = true;
      marker.indexUrl = url;
      writeFileSync(markerPath(TICKET_FROM_BRANCH), JSON.stringify(marker, null, 2) + "\n");
      console.log(`marker ${TICKET_FROM_BRANCH}: indexed`);
    }
    return;
  }
  const entries = readJson(INDEX_JSON, []).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const ext = `target="_blank" rel="noopener noreferrer"`;
  const link = (href, label) => (href ? `<a href="${esc(href)}" ${ext}>${label}</a>` : "");
  const rows = entries
    .map(
      (e) => `<li class="row">
  <div class="head"><span class="ticket">${esc(e.ticket)}</span><span class="status s-${esc(String(e.status).toLowerCase().replace(/\s+/g, "-"))}">${esc(e.status)}</span><time datetime="${esc(e.updated)}">${esc(String(e.updated).slice(0, 10))}</time></div>
  <p class="title">${esc(e.title)}</p>
  <p class="line">${esc(e.headline)}</p>
  <p class="links">${[link(e.artifact, "Artifact"), link(e.linear, "Linear"), link(e.vscode, "VS Code"), link(e.pr, "PR")].filter(Boolean).join("")}</p>
</li>`
    )
    .join("\n");
  const html = readFileSync(join(HERE, "index-template.html"), "utf-8")
    .split("{{COUNT}}").join(String(entries.length))
    .split("{{ROWS}}").join(rows || `<li class="row"><p class="line">No changes shipped yet.</p></li>`);
  mkdirSync(COMMON_LOCAL, { recursive: true });
  writeFileSync(INDEX_HTML, html);
  const url = existsSync(INDEX_URL_FILE) ? readFileSync(INDEX_URL_FILE, "utf-8").trim() : "";
  console.log(`index page: ${INDEX_HTML}`);
  console.log(url ? `publish with url: ${url} (read it first with the Artifact tool if this conversation hasn't)` : "first publish: no url yet — publish as a new Artifact, then run index --published <url>");
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "render") render(rest[0] ?? "");
  else if (cmd === "finalize") finalize(rest);
  else if (cmd === "index") renderIndex(rest);
  else throw new Error("usage: build.mjs render <content.json> | finalize --url <artifact-url> [--linear-attached] [--linear-commented] [--linear-status <name>] | index [--published <url>]");
} catch (err) {
  console.error(`ship-artifact: ${err.message}`);
  process.exit(1);
}
