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
//     → writes .claude/local/artifacts/<TICKET>.json (or branch-<branch>.json)
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
    return pr ? { number: pr.number, url: pr.url, state: String(pr.state).toLowerCase() } : null;
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

  const sessionId = process.env.CLAUDE_CODE_SESSION_ID ?? "";
  const pushed = isPushed();
  const existing = existingPr();
  const pr = existing?.url ?? (pushed ? prUrl(ticket, c.prTitle ?? c.headline, c.summary) : null);
  const linearUrl = ticket ? `https://linear.app/neosleep/issue/${ticket}` : null;
  const prLabel = !existing
    ? "Create PR"
    : existing.state === "merged"
      ? `PR #${existing.number} · merged`
      : existing.state === "closed"
        ? `PR #${existing.number} · closed`
        : `Open PR #${existing.number}`;

  const links = [
    pr ? `<a class="btn primary" href="${esc(pr)}">${esc(prLabel)}</a>` :`<span class="btn ghost" title="Branch not pushed yet">PR link after push</span>`,
    linearUrl ? `<a class="btn" href="${esc(linearUrl)}">Linear ${esc(ticket)}</a>` : "",
    sessionId ? `<a class="btn" href="vscode://anthropic.claude-code/open?session=${esc(sessionId)}">Claude session</a>` : "",
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
    JSON.stringify({ ticket, prUrl: pr, uiChanged, hoisting: c.hoisting, testCoverageMap: c.testCoverageMap, visualComparison: c.visualComparison }, null, 2)
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
  if (ticket) {
    console.log("\n--- Linear comment (post after publishing, replace <ARTIFACT_URL>) ---");
    console.log(`${c.summary.replace(/<[^>]+>/g, "")}\n\nArtifact: <ARTIFACT_URL>${pr ? `\n${prLabel}: ${pr}` : ""}\nBranch: \`${BRANCH}\``);
  }
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
  };
  if (draft.ticket) {
    if (argv.includes("--linear-attached")) marker.linearAttached = true;
    if (argv.includes("--linear-commented")) marker.linearCommented = true;
    if (arg("--linear-status")) marker.linearStatus = arg("--linear-status");
  }
  writeFileSync(path, JSON.stringify(marker, null, 2) + "\n");
  console.log(`marker written: ${path}`);
  const missing = draft.ticket ? ["linearAttached", "linearCommented"].filter((k) => !marker[k]) : [];
  if (missing.length) console.log(`still missing for the quality gate: ${missing.join(", ")}`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "render") render(rest[0] ?? "");
  else if (cmd === "finalize") finalize(rest);
  else throw new Error("usage: build.mjs render <content.json> | finalize --url <artifact-url> [--linear-attached] [--linear-commented] [--linear-status <name>]");
} catch (err) {
  console.error(`ship-artifact: ${err.message}`);
  process.exit(1);
}
