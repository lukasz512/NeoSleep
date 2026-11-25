#!/usr/bin/env node
// Where the Claude Code tokens of this project went (CORE-247).
//
//   node infrastructure/scripts/session-usage.mjs --since 2026-11-09 [--until 2026-11-18] [--dir <transcripts dir>]
//
// Reads the session transcripts (~/.claude/projects/*NeoSleep*/*.jsonl) and reports, for
// the model calls whose own timestamp is inside the window:
//   - the share of tokens spent after /ship-artifact starts (target: under 15%)
//   - calls and tokens per kind of step (CI wait, artifact build, screenshots, …)
//   - quality-gate blocks by reason (each one is one more full-context turn)
//   - tokens by context size (a long session pays for its history on every call)
// "Tokens" is the context a call read: input + cache write + cache read.
// Subagent (sidechain) calls are left out. English only (CLAUDE.md). No dependencies.
import { createReadStream, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const BASH_KINDS = [
  ["artifact build", /ship-artifact\/build\.mjs/],
  ["CI wait/poll", /ci-wait|ci-status|gh run|gh pr checks/],
  ["dev verify", /smoke-dev/],
  ["board", /board\.mjs|pnpm board/],
  ["screenshot take", /playwright|screenshot/i],
  ["tests", /node --test|vitest|pnpm (-r |--filter \S+ )?test|\.test\.sh/],
  ["git", /(^|[;&|\s])git\s/],
];

/** The kind of step a tool call is, for the per-kind table. */
export function stepKind(name, input = {}) {
  if (!name) return "reply";
  if (name === "Bash") {
    const command = String(input.command ?? "");
    return BASH_KINDS.find(([, re]) => re.test(command))?.[0] ?? "bash other";
  }
  if (name === "Read") return /\.(png|jpe?g|webp|gif)$/i.test(String(input.file_path ?? "")) ? "screenshot read" : "read";
  if (name === "Edit" || name === "Write") return "edit/write";
  if (name === "Artifact") return "artifact publish";
  if (name === "Agent" || name === "Task") return "subagent";
  return name.startsWith("Artifact") ? "artifact data/comments" : name.toLowerCase();
}

const GATE_REASONS = [
  ["CI pending / not started", /CI (is running|hasn't started)|wait is running/],
  ["CI red", /CI (failed|is red)/],
  ["dev verify", /not verified on pwa-dev|devVerified/],
  ["merge conflict", /conflict/i],
  ["marker / handover fields", /marker|boardCommented|boardLinked|handover/],
];

/** Why the quality gate blocked the turn, from the text it fed back. */
export function gateReason(text) {
  return GATE_REASONS.find(([, re]) => re.test(text))?.[0] ?? "other";
}

export function contextBucket(tokens) {
  if (tokens < 60_000) return "<60k";
  if (tokens < 115_000) return "60–115k";
  if (tokens < 150_000) return "115–150k";
  return ">150k";
}

const textOf = (content) =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n") : "";

export function emptyStats() {
  return { sessions: 0, calls: 0, tokens: 0, shipCalls: 0, shipTokens: 0, compactions: 0, kinds: {}, shipKinds: {}, gate: {}, buckets: {} };
}

const add = (table, key, tokens) => {
  table[key] ??= { calls: 0, tokens: 0 };
  table[key].calls += 1;
  table[key].tokens += tokens;
};

/**
 * Adds one session's transcript lines (parsed objects, in file order) to `stats`.
 * A line counts only when its own timestamp is inside [since, until): a transcript file
 * that was merely touched in the window brings nothing in.
 */
export function addSession(stats, lines, { since = "", until = "9999" } = {}) {
  const inWindow = (line) => typeof line.timestamp === "string" && line.timestamp >= since && line.timestamp < until;
  const calls = new Map();
  const order = [];
  for (const line of lines) {
    if (!line || line.isSidechain) continue;
    if (line.type === "assistant" && line.message?.id) {
      let call = calls.get(line.message.id);
      if (!call) {
        const usage = line.message.usage ?? {};
        call = {
          counted: inWindow(line),
          tokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
          kind: null,
          startsShip: false,
        };
        calls.set(line.message.id, call);
        order.push(call);
      }
      for (const part of Array.isArray(line.message.content) ? line.message.content : []) {
        if (part?.type !== "tool_use") continue;
        call.kind ??= stepKind(part.name, part.input);
        if (part.name === "Skill" && /ship-artifact/.test(String(part.input?.skill ?? ""))) call.startsShip = true;
      }
    } else if (line.type === "user" && inWindow(line)) {
      if (line.isCompactSummary) order.push({ compaction: true });
      const text = textOf(line.message?.content);
      if (text.includes("Quality gate failed")) order.push({ gate: gateReason(text) });
    }
  }
  let shipped = false;
  let used = false;
  for (const event of order) {
    if (event.compaction) stats.compactions += 1;
    else if (event.gate) stats.gate[event.gate] = (stats.gate[event.gate] ?? 0) + 1;
    else {
      if (event.startsShip) shipped = true;
      if (!event.counted) continue;
      used = true;
      const kind = event.kind ?? "reply";
      stats.calls += 1;
      stats.tokens += event.tokens;
      add(stats.kinds, kind, event.tokens);
      add(stats.buckets, contextBucket(event.tokens), event.tokens);
      if (shipped) {
        stats.shipCalls += 1;
        stats.shipTokens += event.tokens;
        add(stats.shipKinds, kind, event.tokens);
      }
    }
  }
  if (used) stats.sessions += 1;
  return stats;
}

const pct = (part, whole) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : "0%");
const millions = (tokens) => `${(tokens / 1e6).toFixed(1)}M`;

export function report(stats) {
  const rows = (table) =>
    Object.entries(table)
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .map(([key, row]) => `  ${key.padEnd(26)} ${String(row.calls).padStart(5)} calls  ${millions(row.tokens).padStart(8)}  ${pct(row.tokens, stats.tokens).padStart(6)}`);
  const gate = Object.entries(stats.gate).sort((a, b) => b[1] - a[1]);
  return [
    `${stats.sessions} sessions, ${stats.calls} model calls, ${millions(stats.tokens)} tokens read, ${stats.compactions} compactions`,
    `after /ship-artifact starts: ${pct(stats.shipTokens, stats.tokens)} of tokens (${stats.shipCalls} calls) — target under 15%`,
    "",
    "After /ship-artifact, by step:",
    ...rows(stats.shipKinds),
    "",
    `Quality-gate blocks: ${gate.reduce((sum, [, count]) => sum + count, 0)}`,
    ...gate.map(([reason, count]) => `  ${reason.padEnd(26)} ${String(count).padStart(5)}`),
    "",
    "Tokens by context size of the call:",
    ...rows(stats.buckets),
    "",
    "All calls, by step:",
    ...rows(stats.kinds),
  ].join("\n");
}

async function readLines(file) {
  const lines = [];
  for await (const raw of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    try {
      const line = JSON.parse(raw);
      // keep only what addSession reads: a transcript can be hundreds of MB
      if (line.type === "assistant") {
        const content = (Array.isArray(line.message?.content) ? line.message.content : []).filter((part) => part?.type === "tool_use");
        lines.push({ type: "assistant", isSidechain: line.isSidechain, timestamp: line.timestamp, message: { id: line.message?.id, usage: line.message?.usage, content } });
      } else if (line.type === "user") {
        const text = textOf(line.message?.content);
        lines.push({ type: "user", isSidechain: line.isSidechain, timestamp: line.timestamp, isCompactSummary: line.isCompactSummary, message: { content: text.includes("Quality gate failed") ? text.slice(0, 2000) : "" } });
      }
    } catch {
      // benign: a half-written last line of a live session
    }
  }
  return lines;
}

async function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const since = arg("--since");
  if (!since) throw new Error("usage: session-usage.mjs --since <YYYY-MM-DD> [--until <YYYY-MM-DD>] [--dir <transcripts dir>]");
  const base = join(homedir(), ".claude/projects");
  const dirs = arg("--dir") ? [arg("--dir")] : readdirSync(base).filter((name) => name.includes("NeoSleep")).map((name) => join(base, name));
  const stats = emptyStats();
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".jsonl")) addSession(stats, await readLines(join(dir, name)), { since, until: arg("--until") });
    }
  }
  console.log(report(stats));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`session-usage: ${err.message}`);
    process.exit(1);
  });
}
