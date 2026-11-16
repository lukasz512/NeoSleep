#!/usr/bin/env node
// board — the work board from the terminal (CORE-187). Claude Code sessions create,
// comment on and hand over their tickets here instead of Linear (decision D2); hooks
// and /ship-artifact call it too. Auth: a session token issued on the board
// (/platform/board → Session tokens), one per device.
//
//   pnpm board create --team CORE --title "…" --body "## Problem\n…\n## Change\n…\n## Done when\n…" [--priority 2]
//                     (or --body-file <path.md> instead of --body)
//   pnpm board get CORE-12                      → the item + its history as JSON
//   pnpm board comment CORE-12 "text"
//   pnpm board link CORE-12 --kind artifact|spec|pr|ci|other --url https://… [--title "…"]
//   pnpm board branch CORE-12 worktree-core-12-slug
//   pnpm board move CORE-12 building|needs_review
//   pnpm board teams [--write]                  → team keys; --write refreshes .claude/ticket-teams
//   pnpm board url CORE-12                      → the card's link (no network)
//
// Config: .claude/local/board.json { "apiUrl": "https://…", "token": "nbs_…", "boardUrl"?: "…" }
// (gitignored), or BOARD_API_URL / BOARD_TOKEN / BOARD_URL in the environment.
// English only (CLAUDE.md). No dependencies beyond Node.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_FILE = join(ROOT, ".claude/local/board.json");
const TEAMS_FILE = join(ROOT, ".claude/ticket-teams");
const DEFAULT_BOARD_URL = "https://pwa.neosleepcare.com/platform/board";

/** Same limit and headings the board API enforces for a session ticket (NEO-84). */
export const MAX_TICKET = 1500;
const SECTIONS = [
  ["## Problem", "problem"],
  ["## Change", "change"],
  ["## Done when", "done_when"],
];

/** "## Problem / ## Change / ## Done when" markdown → { problem, change, done_when } (missing → ""). */
export function parseTicketBody(markdown) {
  const out = { problem: "", change: "", done_when: "" };
  let current = null;
  const lines = { problem: [], change: [], done_when: [] };
  for (const line of String(markdown ?? "").split("\n")) {
    const heading = SECTIONS.find(([h]) => line.trim() === h);
    if (heading) {
      current = heading[1];
      continue;
    }
    if (current) lines[current].push(line);
  }
  for (const key of Object.keys(out)) out[key] = lines[key].join("\n").trim();
  return out;
}

/** What is wrong with a ticket body, as short phrases; empty when it is fine. */
export function ticketProblems(markdown) {
  const problems = [];
  const body = String(markdown ?? "");
  if (!body.trim()) return ["the body is empty"];
  for (const [heading] of SECTIONS) {
    if (!body.split("\n").some((line) => line.trim() === heading)) problems.push(`missing the '${heading}' heading`);
  }
  const parsed = parseTicketBody(body);
  for (const [heading, key] of SECTIONS) {
    if (body.includes(heading) && !parsed[key]) problems.push(`'${heading}' is empty`);
  }
  const length = parsed.problem.length + parsed.change.length + parsed.done_when.length;
  if (length > MAX_TICKET) problems.push(`it is ${length} characters (max ${MAX_TICKET})`);
  return problems;
}

/** --flag value pairs and positionals. */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[arg.slice(2)] = true;
      else {
        flags[arg.slice(2)] = next;
        i++;
      }
    } else positional.push(arg);
  }
  return { flags, positional };
}

export function loadConfig(env = process.env, file = CONFIG_FILE) {
  let fromFile = {};
  try {
    fromFile = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    // benign: no config file yet; the environment may carry everything
  }
  return {
    apiUrl: String(env.BOARD_API_URL ?? fromFile.apiUrl ?? "").replace(/\/+$/, ""),
    token: String(env.BOARD_TOKEN ?? fromFile.token ?? ""),
    boardUrl: String(env.BOARD_URL ?? fromFile.boardUrl ?? DEFAULT_BOARD_URL).replace(/\/+$/, ""),
  };
}

export function cardUrl(key, config = loadConfig()) {
  return `${config.boardUrl}?item=${encodeURIComponent(key.toUpperCase())}`;
}

/** Rewrites only the key lines of .claude/ticket-teams, keeping its comment header. */
export function teamsFileWith(current, keys) {
  const header = current.split("\n").filter((line) => line.startsWith("#"));
  return [...header, ...keys].join("\n") + "\n";
}

async function call(config, method, path, body, fetchImpl = fetch) {
  if (!config.apiUrl || !config.token) {
    throw new Error(`board is not configured: put { "apiUrl", "token" } in ${CONFIG_FILE} (issue a token on the board → Session tokens)`);
  }
  const res = await fetchImpl(`${config.apiUrl}/api/v1/platform/work${path}`, {
    method,
    headers: { "X-Session-Token": config.token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.error ?? "request failed"}${json.field ? ` (${json.field})` : ""}`);
  return json;
}

function need(value, what) {
  if (!value || value === true) throw new Error(`missing ${what}`);
  return String(value);
}

export async function run(argv, { config = loadConfig(), fetchImpl = fetch, log = console.log } = {}) {
  const [command, ...rest] = argv;
  const { flags, positional } = parseArgs(rest);
  const key = positional[0]?.toUpperCase();
  switch (command) {
    case "create": {
      const raw = typeof flags["body-file"] === "string" ? readFileSync(flags["body-file"], "utf-8") : flags.body;
      const body = need(raw, "--body or --body-file (## Problem / ## Change / ## Done when)").replace(/\\n/g, "\n");
      const problems = ticketProblems(body);
      if (problems.length) throw new Error(`ticket rejected (NEO-84 format): ${problems.join("; ")}`);
      const payload = { team: need(flags.team, "--team").toUpperCase(), title: need(flags.title, "--title"), ...parseTicketBody(body) };
      if (flags.priority !== undefined) payload.priority = Number(flags.priority);
      const { item } = await call(config, "POST", "/items", payload, fetchImpl);
      log(`${item.key} ${cardUrl(item.key, config)}`);
      // Replaces the old Linear PostToolUse reminder: the session tab should lead with the key.
      log(`New ticket ${item.key}: tell Łukasz to run /rename so the tab title leads with [${item.key}], and prefix your next reply with [${item.key}].`);
      return item;
    }
    case "get": {
      const result = await call(config, "GET", `/items/${need(key, "the ticket key")}`, null, fetchImpl);
      log(JSON.stringify(result, null, 2));
      return result;
    }
    case "comment": {
      const text = need(positional.slice(1).join(" ") || flags.body, "the comment text").replace(/\\n/g, "\n");
      await call(config, "POST", `/items/${need(key, "the ticket key")}/comments`, { body: text }, fetchImpl);
      log(`commented on ${key}`);
      return null;
    }
    case "link": {
      const link = { kind: need(flags.kind, "--kind"), url: need(flags.url, "--url") };
      if (typeof flags.title === "string") link.title = flags.title;
      const { item } = await call(config, "PATCH", `/items/${need(key, "the ticket key")}`, { add_links: [link] }, fetchImpl);
      log(`linked ${link.kind} on ${item.key}`);
      return item;
    }
    case "branch": {
      const { item } = await call(config, "PATCH", `/items/${need(key, "the ticket key")}`, { branch: need(positional[1], "the branch name") }, fetchImpl);
      log(`${item.key} branch ${item.branch}`);
      return item;
    }
    case "move": {
      const { item } = await call(config, "PATCH", `/items/${need(key, "the ticket key")}`, { status: need(positional[1], "the status") }, fetchImpl);
      log(`${item.key} → ${item.status}`);
      return item;
    }
    case "teams": {
      const { items } = await call(config, "GET", "/teams", null, fetchImpl);
      const keys = items.map((t) => t.key);
      if (flags.write) writeFileSync(TEAMS_FILE, teamsFileWith(readFileSync(TEAMS_FILE, "utf-8"), keys));
      log(keys.join("\n"));
      return keys;
    }
    case "url": {
      const url = cardUrl(need(key, "the ticket key"), config);
      log(url);
      return url;
    }
    default:
      throw new Error("usage: board create|get|comment|link|branch|move|teams|url … (see the header of infrastructure/scripts/board.mjs)");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(process.argv.slice(2)).catch((err) => {
    console.error(`board: ${err.message}`);
    process.exit(1);
  });
}
