#!/usr/bin/env node
// board-git-state — tells the work board where each ticket's code is (CORE-221). The API runs
// on Cloud Run without a checkout, so GitHub Actions reads git and reports
// (.github/workflows/board-git-state.yml):
//   - a ticket is `prod` when the newest commit citing its key on origin/dev is on origin/prod
//     too (or only prod cites it: a hotfix), `dev` when dev cites it with something newer;
//   - every ticket the report leaves out becomes `none` ("nothing merged") on the board;
//   - with --close (after a green prod smoke test) the board moves Needs Review tickets that
//     are on prod to Done, except those labeled `hold`.
// A commit cites a ticket with <KEY>-<n> anywhere in its subject or body, any letter case; that
// covers the branch name in a merge commit. Team keys come from .claude/ticket-teams.
//
//   node infrastructure/scripts/board-git-state.mjs [--close --smoke-url <run url>] [--dry-run]
//
// env: BOARD_API_URL + BOARD_AGENT_TOKEN. Needs full history of both branches (fetch-depth: 0).
// English only (CLAUDE.md).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./board.mjs";
import { ticketTeams } from "../../.claude/skills/ship-artifact/ticket.mjs";

const LOG_FORMAT = "--format=%H%x1f%s%x1f%b%x1e";

/** `git log` records as { sha, text }, in git's order (newest first). */
export function parseLog(raw) {
  return raw
    .split("\x1e")
    .map((record) => record.replace(/^\n/, ""))
    .filter(Boolean)
    .map((record) => {
      const [sha, subject = "", body = ""] = record.split("\x1f");
      return { sha, text: `${subject}\n${body}` };
    });
}

/** Ticket keys a commit text cites, upper-cased, each once, in order of appearance. */
export function citedKeys(text, teams) {
  const re = new RegExp(`(?<![A-Za-z0-9])(${teams.join("|")})-(\\d+)(?!\\d)`, "gi");
  return [...new Set([...text.matchAll(re)].map((m) => `${m[1].toUpperCase()}-${m[2]}`))];
}

/** Newest citing commit per key. */
function newestByKey(log, teams) {
  const newest = new Map();
  for (const { sha, text } of parseLog(log)) {
    for (const key of citedKeys(text, teams)) if (!newest.has(key)) newest.set(key, sha);
  }
  return newest;
}

/** All citing commits per key. */
function shasByKey(log, teams) {
  const all = new Map();
  for (const { sha, text } of parseLog(log)) {
    for (const key of citedKeys(text, teams)) all.set(key, (all.get(key) ?? new Set()).add(sha));
  }
  return all;
}

/** One { key, state, sha } per ticket cited on dev or prod, sorted by key. */
export function gitStates({ dev, prod, teams }) {
  const onDev = newestByKey(dev, teams);
  const onProd = shasByKey(prod, teams);
  const newestOnProd = newestByKey(prod, teams);
  const items = [];
  for (const key of new Set([...onDev.keys(), ...onProd.keys()])) {
    const devSha = onDev.get(key);
    const shipped = devSha === undefined || onProd.get(key)?.has(devSha);
    items.push({ key, state: shipped ? "prod" : "dev", sha: devSha ?? newestOnProd.get(key) });
  }
  return items.sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
}

export async function report({ items, close = null, config, fetchImpl = fetch }) {
  const res = await fetchImpl(`${config.apiUrl.replace(/\/+$/, "")}/api/v1/platform/work/git-state`, {
    method: "POST",
    headers: { "X-Agent-Token": config.agentToken, "Content-Type": "application/json" },
    body: JSON.stringify({ items, complete: true, ...(close ? { close } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  // The API revision that knows this route is not serving yet (the deploy runs beside this job).
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`board POST /git-state → ${res.status}: ${json.error ?? "request failed"}`);
  return json;
}

function gitLog(ref) {
  return execFileSync("git", ["log", ref, LOG_FORMAT], { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const items = gitStates({ dev: gitLog("origin/dev"), prod: gitLog("origin/prod"), teams: ticketTeams() });
  const count = (state) => items.filter((i) => i.state === state).length;
  console.log(`${items.length} tickets cited: ${count("prod")} on prod, ${count("dev")} on dev only.`);
  if (flags["dry-run"]) return console.log(JSON.stringify(items, null, 2));

  const { BOARD_API_URL, BOARD_AGENT_TOKEN } = process.env;
  if (!BOARD_API_URL || !BOARD_AGENT_TOKEN) throw new Error("BOARD_API_URL and BOARD_AGENT_TOKEN are required");
  if (flags.close && typeof flags["smoke-url"] !== "string") throw new Error("--close needs --smoke-url <the smoke test run>");
  const close = flags.close ? { smoke_url: flags["smoke-url"] } : null;
  const result = await report({ items, close, config: { apiUrl: BOARD_API_URL, agentToken: BOARD_AGENT_TOKEN } });
  if (!result) return console.log("::warning::The board API has no /git-state route yet; nothing reported. The next run retries.");
  console.log(`board: ${result.updated} tickets updated, closed: ${result.closed?.join(", ") || "none"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`board-git-state: ${err.message}`);
    process.exit(1);
  });
}
