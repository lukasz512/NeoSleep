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
//   node .claude/skills/ship-artifact/build.mjs index [--page | --all]
//     → writes this branch's index row JSON and prints the ArtifactData calls that store it
//       (--page: the static index shell, republished only when its template changes;
//        --all: every row as import batches) — CORE-105
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
import { ticketFromBranch, ticketTeams } from "./ticket.mjs";
import { COLLECTION, docId, toRow, importBatches } from "./index-rows.mjs";
import { validateQuestions, widget } from "../decision-form/decisions.mjs";
import { cacheGet, cacheSet, defaultCachePath, isRateLimitError, noteRateLimit, rateLimitedUntil } from "../../../infrastructure/scripts/gh-cache.mjs";

/** A PR appears or merges rarely; one lookup per branch per 10 minutes is plenty (CORE-128). */
const PR_CACHE_TTL_MS = 10 * 60_000;

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
const TICKET_FROM_BRANCH = ticketFromBranch(BRANCH);
const MARKER_DIR = join(ROOT, ".claude/local/artifacts");
const DRAFT = join(MARKER_DIR, ".draft.json");
// The index is shared by every worktree, so it lives in the main checkout's .claude/local.
const COMMON_LOCAL = join(dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir") || join(ROOT, ".git")), ".claude/local");
const INDEX_JSON = join(COMMON_LOCAL, "artifact-index.json");
const INDEX_HTML = join(COMMON_LOCAL, "artifact-index.html");
const INDEX_URL_FILE = join(COMMON_LOCAL, "artifact-index-url.txt");
const INDEX_ROWS_DIR = join(COMMON_LOCAL, "artifact-index-rows");
// Everyone it is shared with reads; only the owner/editors write (via ArtifactData).
const INDEX_CAPABILITIES = { db: { rules: [{ path: "", read: "view", write: "admin" }] } };
const SESSION_ID = process.env.CLAUDE_CODE_SESSION_ID ?? "";
const linearUrlOf = (ticket) => `https://linear.app/neosleep/issue/${ticket}`;
const vscodeUrlOf = (id) => `vscode://anthropic.claude-code/open?session=${id}`;

// Short on purpose: Łukasz reads these after every session (NEO-84, "no AI slop").
const LIMITS = {
  headline: 110,
  summaryChars: 320,
  summarySentences: 2,
  prTitle: 80,
  list: { notes: [4, 220], verify: [8, 160] },
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
  // Decisions are 3-button questions (CORE-44), validated by the shared widget.
  problems.push(...validateQuestions(c.decisions ?? []));
  for (const d of c.defaults ?? []) if (!d?.text || !d?.test) problems.push("defaults: each item needs text + test (the test that proves it)");
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
    // CORE-128: shared 10-minute cache and the API cooldown, so re-rendering doesn't spend the GitHub limit.
    const cachePath = defaultCachePath();
    const key = `pr:${BRANCH}`;
    let prs = cacheGet(cachePath, key);
    if (prs === undefined) {
      if (rateLimitedUntil(cachePath)) return null;
      try {
        const out = execFileSync("gh", ["pr", "list", "--head", BRANCH, "--state", "all", "--limit", "1", "--json", "number,url,state"], {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        prs = JSON.parse(out);
        cacheSet(cachePath, key, prs, PR_CACHE_TTL_MS);
      } catch (err) {
        if (isRateLimitError(err)) noteRateLimit(cachePath);
        return null;
      }
    }
    const pr = prs[0];
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

// Service marks (simple-icons paths, 24x24) so each button shows what it connects to (NEO-91).
const ICON_PATHS = {
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  linear: "M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z",
  vscode: "M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z",
  artifact: "M4 2h11l5 5v15H4V2Zm10 1.5V8h4.5L14 3.5ZM7 12h10v1.6H7V12Zm0 4h10v1.6H7V16Z",
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${ICON_PATHS[name]}"/></svg>`;

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
    throw new Error(`every change needs a Linear ticket (NEO-84): create it in Linear first and work on a branch named after it (worktree-<key>-<n>-<slug>, key one of ${ticketTeams().join("/")})`);
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
  // Always the same order: PR, Linear, VS Code. No "Artifact" button — on the page
  // itself it would only link to itself (NEO-91); the Linear comment and index keep it.
  const links = [
    pr ? `<a class="btn primary" href="${esc(pr)}" ${ext}>${icon("github")}${esc(prLabel)}</a>` :`<span class="btn ghost" title="Branch not pushed yet">${icon("github")}PR link after push</span>`,
    `<a class="btn" href="${esc(linearUrl)}" ${ext}>${icon("linear")}Linear</a>`,
    `<a class="btn" href="${esc(vscodeUrlOf(sessionId))}" ${ext}>${icon("vscode")}VS Code</a>`,
  ].join("");

  // One click per question: yes · no · expanded variant (CORE-44). The answers come
  // back as an artifact comment, so the page must be published with comments on.
  const dw = c.decisions?.length ? widget({ id: `${ticket.toLowerCase()}-decisions`, ticket, title: c.title, questions: c.decisions, ui: c.decisionsUi }) : null;
  const decisions = dw ? `<div class="decide"><h2>${esc(c.decisionsUi?.title ?? "Needs your decision")}</h2>${dw.html}</div>` : "";
  const defaults = c.defaults?.length
    ? `<div class="defaults"><h2>Decided without asking — the test proves it</h2><ul>${c.defaults.map((d) => `<li>${d.text} <code>${esc(d.test)}</code></li>`).join("")}</ul></div>`
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
    TICKET: esc(ticket),
    RESUME: sessionId ? `<p class="mono muted">claude --resume ${esc(sessionId)}</p>` : "",
    EYEBROW: [ticket, c.kind, c.area].filter(Boolean).map(esc).join(" · "),
    HEADLINE: c.headline,
    SUMMARY: c.summary,
    DECISIONS: decisions + defaults,
    DECISION_CSS: dw?.css ?? "",
    DECISION_SCRIPT: dw?.script ?? "",
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
  if (dw) console.log('decisions: publish with capabilities {"comments": {}} so "Send to Claude" works');
  console.log(`marker: ${markerPath(ticket)} (written by finalize)`);
  console.log(
    existing
      ? `PR: #${existing.number} (${existing.state}) — the button links to it`
      : pushed
        ? "pushed: yes — Create PR button is live"
        : "pushed: no — re-run render after push to get the Create PR button"
  );
  if (!selfUrl) console.log("first render: after publish + finalize, the Linear comment below gets the Artifact URL filled in");
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
  console.log(`index updated: ${INDEX_JSON} — next: build.mjs index (writes one db row, no page republish)`);

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
  const entries = readJson(INDEX_JSON, []);
  const url = existsSync(INDEX_URL_FILE) ? readFileSync(INDEX_URL_FILE, "utf-8").trim() : "<index url>";
  mkdirSync(INDEX_ROWS_DIR, { recursive: true });
  const writeRow = (e) => {
    const file = join(INDEX_ROWS_DIR, `${docId(e)}.json`);
    writeFileSync(file, JSON.stringify(toRow(e)) + "\n");
    return file;
  };

  // The page is a static shell over the `changes` collection: republish it only when
  // index-template.html changes, never per ship (CORE-105).
  if (argv.includes("--page")) {
    writeFileSync(INDEX_HTML, readFileSync(join(HERE, "index-template.html"), "utf-8"));
    console.log(`index page: ${INDEX_HTML} — publish with url ${url}, capabilities ${JSON.stringify(INDEX_CAPABILITIES)}`);
    return;
  }

  // One-time import of every row into an empty collection.
  if (argv.includes("--all")) {
    const batches = importBatches(entries, writeRow);
    batches.forEach((writes, n) => writeFileSync(join(INDEX_ROWS_DIR, `batch-${n + 1}.json`), JSON.stringify(writes) + "\n"));
    console.log(`${entries.length} rows in ${batches.length} batch(es): ${INDEX_ROWS_DIR}/batch-<n>.json — pass each file's array as ArtifactData batch \`writes\` (url ${url})`);
    return;
  }

  const entry = entries.find((e) => e.branch === BRANCH) ?? entries.find((e) => TICKET_FROM_BRANCH && e.ticket === TICKET_FROM_BRANCH);
  if (!entry) throw new Error(`no index line for branch ${BRANCH} — run finalize first`);
  const file = writeRow(entry);
  const id = docId(entry);
  console.log(`row: ${file}`);
  console.log(`1. ArtifactData get  url=${url} collection=${COLLECTION} doc_id=${id}`);
  console.log(`2. ArtifactData set  url=${url} collection=${COLLECTION} doc_id=${id} file_path=${file} (+ if_version from step 1 when it exists)`);
  console.log(`3. node .claude/skills/ship-artifact/build.mjs index --published ${url}`);
}

// A non-UI change (lib/change-shape.sh says "light", CORE-175 D2) is handed over with one
// Linear comment carrying the PR link — no page, no Change Index row.
function light(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  if (!TICKET_FROM_BRANCH) throw new Error(`branch ${BRANCH} has no ticket id`);
  const pr = arg("--pr") ?? prUrl(TICKET_FROM_BRANCH, arg("--title"), "");
  if (!pr) throw new Error("--pr <compare or pull url> is required (no GitHub remote found)");
  const path = markerPath(TICKET_FROM_BRANCH);
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
  const marker = {
    ...previous,
    light: true,
    ticket: TICKET_FROM_BRANCH,
    linearUrl: linearUrlOf(TICKET_FROM_BRANCH),
    prUrl: pr,
    ...(argv.includes("--linear-commented") ? { linearCommented: true } : {}),
    ...(arg("--linear-status") ? { linearStatus: arg("--linear-status") } : {}),
  };
  mkdirSync(MARKER_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(marker, null, 2) + "\n");
  console.log(`light marker written: ${path}`);
  console.log(`Linear comment for ${TICKET_FROM_BRANCH}: <2 sentences: what changed and why>\nPR: ${pr}\nBranch: \`${BRANCH}\``);
  if (!marker.linearCommented) console.log("still missing for the quality gate: linearCommented");
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "render") render(rest[0] ?? "");
  else if (cmd === "finalize") finalize(rest);
  else if (cmd === "index") renderIndex(rest);
  else if (cmd === "light") light(rest);
  else throw new Error("usage: build.mjs render <content.json> | finalize --url <artifact-url> [--linear-attached] [--linear-commented] [--linear-status <name>] | index [--page | --all | --published <url>] | light [--pr <url>] [--linear-commented] [--linear-status <name>]");
} catch (err) {
  console.error(`ship-artifact: ${err.message}`);
  process.exit(1);
}
