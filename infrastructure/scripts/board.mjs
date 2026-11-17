#!/usr/bin/env node
// board — the work board from the terminal (CORE-187). Claude Code sessions create,
// comment on and hand over their tickets here instead of Linear (decision D2); hooks
// and /ship-artifact call it too. Auth: a session token issued on the board
// (/platform/board → Session tokens), one per device.
//
//   pnpm board create --team CORE --title "…" --body "## Problem\n…\n## Change\n…\n## Done when\n…" [--priority 2]
//                     (or --body-file <path.md> instead of --body; --later puts a side ticket
//                     nobody is building yet in Backlog instead of Building, CORE-223)
//   pnpm board get CORE-12                      → the item + its history as JSON
//   pnpm board comment CORE-12 "text"
//   pnpm board link CORE-12 --kind artifact|spec|pr|ci|other --url https://… [--title "…"] [--state passed|failed] (state: ci only)
//   pnpm board branch CORE-12 worktree-core-12-slug
//   pnpm board move CORE-12 building|needs_review|approved
//                     (approved: only a Backlog pick Łukasz clicked, 3 a week at most, CORE-234)
//   pnpm board waiting [--remind]               → Needs Review tickets that wait for Łukasz, the longest wait
//                     first; --remind prints one line only when too many are old (session start, CORE-233)
//   pnpm board picks [--remind]                 → Backlog tickets ready for Approved, the most urgent first;
//                     --remind prints one line only on a Monday when Approved runs low (session start, CORE-234)
//   pnpm board review --form <form id> [--confirm <second form id>] CORE-12=keep NEO-3=later CORE-9=cancel NEO-7=shipped
//                     → applies Łukasz's backlog-review answers (shipped closes only what is on prod;
//                     a cancel is skipped until --confirm names the form in which he repeated it)
//   pnpm board teams [--write]                 → team keys; --write refreshes .claude/ticket-teams
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

/** The session-start reminder fires above this many tickets waiting longer than REVIEW_DAYS (CORE-233). */
export const REVIEW_LIMIT = 5;
export const REVIEW_DAYS = 7;
/** Same label the board uses to keep a merged ticket in Needs Review (CORE-221). */
const HOLD_LABEL = "hold";

/** The board's "Waiting for you" group: Needs Review, not merged or on hold; the longest wait first, with whole days. */
export function waitingForReview(items, now = Date.now()) {
  return items
    .filter((item) => item.status === "needs_review")
    .filter((item) => !["dev", "prod"].includes(item.git_state) || (item.labels ?? []).includes(HOLD_LABEL))
    .map((item) => ({ ...item, days: Math.max(0, Math.floor((now - Date.parse(item.status_changed_at)) / 86_400_000)) }))
    .sort((a, b) => b.days - a.days);
}

/** One line for the session start when more than REVIEW_LIMIT tickets have waited over REVIEW_DAYS days; else null. */
export function reviewReminder(items, now = Date.now()) {
  const old = waitingForReview(items, now).filter((item) => item.days > REVIEW_DAYS);
  if (old.length <= REVIEW_LIMIT) return null;
  const list = old.map((item) => `${item.key} (${item.days} d)`).join(", ");
  return `${old.length} tickets have waited for Łukasz's review for more than ${REVIEW_DAYS} days: ${list}. Tell him in one line before creating a new ticket.`;
}

/** The Monday reminder fires while Approved holds fewer tickets than this, and offers up to PICKS_OFFERED (CORE-234). */
export const APPROVED_LOW = 3;
export const PICKS_OFFERED = 5;
/** Labels that keep a Backlog ticket out of the picks: set aside, parked, or waiting on something else. */
const NOT_A_PICK = ["later", HOLD_LABEL, "blocked"];
const REVIEW_DECISIONS = ["keep", "later", "cancel", "shipped"];

/** Backlog tickets ready for Approved (a priority and a Done when, not set aside): the most urgent first, then the oldest. */
export function backlogPicks(items) {
  return items
    .filter((item) => item.status === "backlog" && item.priority > 0 && (item.done_when ?? "").trim())
    .filter((item) => !(item.labels ?? []).some((label) => NOT_A_PICK.includes(label.toLowerCase())))
    .sort((a, b) => a.priority - b.priority || Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** One line for the session start, on a Monday with fewer than APPROVED_LOW tickets in Approved; else null. */
export function picksReminder(items, now = Date.now()) {
  if (new Date(now).getDay() !== 1) return null;
  const approved = items.filter((item) => item.status === "approved").length;
  const picks = backlogPicks(items).slice(0, PICKS_OFFERED);
  if (approved >= APPROVED_LOW || !picks.length) return null;
  const list = picks.map((item) => `${item.key} (P${item.priority})`).join(", ");
  return `Approved holds ${approved} ticket${approved === 1 ? "" : "s"}. Offer Łukasz these Backlog picks as one decision form before other work: ${list}.`;
}

/** "CORE-1=keep" pairs → the body of a backlog review. */
export function parseReviewAnswers(pairs) {
  return pairs.map((pair) => {
    const [key, decision, ...more] = pair.split("=");
    if (!/^[A-Za-z]+-\d+$/.test(key ?? "") || !REVIEW_DECISIONS.includes(decision) || more.length) {
      throw new Error(`"${pair}" is not KEY=${REVIEW_DECISIONS.join("|")}`);
    }
    return { key: key.toUpperCase(), decision };
  });
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

export async function run(argv, { config = loadConfig(), fetchImpl = fetch, log = console.log, now = Date.now() } = {}) {
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
      if (flags.later) payload.status = "backlog";
      const { item } = await call(config, "POST", "/items", payload, fetchImpl);
      log(`${item.key} ${cardUrl(item.key, config)}`);
      // A ticket for later is not this session's work: the tab keeps its title.
      if (flags.later) return item;
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
      if (typeof flags.state === "string") link.state = flags.state;
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
    case "waiting": {
      const { items } = await call(config, "GET", "/items?status=needs_review", null, fetchImpl);
      if (flags.remind) {
        const line = reviewReminder(items, now);
        if (line) log(line);
        return line;
      }
      const waiting = waitingForReview(items, now);
      for (const item of waiting) log(`${item.key}\t${item.days} d\t${item.title}`);
      return waiting;
    }
    case "picks": {
      const { items } = await call(config, "GET", "/items?status=backlog,approved", null, fetchImpl);
      if (flags.remind) {
        const line = picksReminder(items, now);
        if (line) log(line);
        return line;
      }
      const picks = backlogPicks(items);
      for (const item of picks) log(`${item.key}\tP${item.priority}\t${item.title}`);
      return picks;
    }
    case "review": {
      const decisions = parseReviewAnswers(positional);
      if (!decisions.length) throw new Error("missing the answers (KEY=keep|later|cancel|shipped …)");
      const body = { form: need(flags.form, "--form (the decision form's id)"), ...(flags.confirm ? { confirm: flags.confirm } : {}), decisions };
      const result = await call(config, "POST", "/backlog-review", body, fetchImpl);
      for (const { key: applied, decision } of result.applied) log(`${applied}\t${decision}`);
      for (const { key: skipped, reason } of result.skipped) log(`${skipped}\tskipped: ${reason}`);
      return result;
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
      throw new Error("usage: board create|get|comment|link|branch|move|waiting|picks|review|teams|url … (see the header of infrastructure/scripts/board.mjs)");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(process.argv.slice(2)).catch((err) => {
    console.error(`board: ${err.message}`);
    process.exit(1);
  });
}
