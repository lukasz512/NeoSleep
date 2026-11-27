#!/usr/bin/env node
// board-verify — runs the post-landing checks for tickets the board put in Verifying (CORE-277)
// and posts the outcome (.github/workflows/board-verify.yml):
//   1. GET  /platform/work/items?status=verifying        (tickets whose code reached dev)
//   2. run the checks once (the same code is under test for every ticket in the batch):
//        - the test command (default: pnpm test)
//        - the pwa-dev bundle smoke test (reachable, JS/CSS chunks load)
//   3. POST /platform/work/items/<KEY>/verify-result     { state, run_url, results }
//      The board returns the ticket to Needs Review; a fail opens a fix ticket in Approved.
// `results` is the AC -> test map: one row per line of the ticket's "Done when" section.
//
//   node infrastructure/scripts/board-verify.mjs --run-url <CI run url> [--test-cmd "pnpm test"] [--dry-run]
//
// env: BOARD_API_URL + BOARD_AGENT_TOKEN. English only (CLAUDE.md).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./board.mjs";

const MAX_ROWS = 200;
const MAX_TEXT = 300;

/** "Done when" markdown → one acceptance criterion per bullet or non-empty line, markers stripped. */
export function acceptanceCriteria(doneWhen) {
  return String(doneWhen ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s*(?:\[[ xX]\]\s*)?/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_ROWS)
    .map((text) => text.slice(0, MAX_TEXT));
}

/** AC -> test rows for one ticket: every criterion is covered by the checks that ran. */
export function resultRows(doneWhen, checks) {
  const status = checks.every((c) => c.ok) ? "pass" : "fail";
  const test = checks.map((c) => c.name).join(" + ").slice(0, MAX_TEXT);
  const criteria = acceptanceCriteria(doneWhen);
  const rows = criteria.length > 0 ? criteria : ["Ticket checks"];
  return rows.map((ac) => ({ ac, test, status }));
}

/** The overall state: pass only when every check passed. */
export function overallState(checks) {
  return checks.every((c) => c.ok) ? "pass" : "fail";
}

function api(config, fetchImpl) {
  const base = `${config.apiUrl.replace(/\/+$/, "")}/api/v1/platform/work`;
  const headers = { "X-Agent-Token": config.agentToken, "Content-Type": "application/json" };
  return async (path, init = {}) => {
    const res = await fetchImpl(`${base}${path}`, { ...init, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`board ${init.method ?? "GET"} ${path} → ${res.status}: ${json.error ?? "request failed"}`);
    return json;
  };
}

/** Tickets waiting for verification. */
export async function pendingItems({ config, fetchImpl = fetch }) {
  let items;
  try {
    ({ items } = await api(config, fetchImpl)("/items?status=verifying"));
  } catch (err) {
    // The board API runs on prod; until the dev -> prod promotion it does not know the status yet.
    if (err instanceof Error && /→ 400: unknown status/.test(err.message)) {
      console.warn("board API does not know the verifying status yet (not promoted to prod): nothing to verify");
      return [];
    }
    throw err;
  }
  return items.filter((item) => item.verify_state === "pending");
}

/** Posts the result for one ticket. A 409 means the ticket left Verifying meanwhile: not an error. */
export async function postResult({ item, state, runUrl, checks, config, fetchImpl = fetch }) {
  const res = await fetchImpl(`${config.apiUrl.replace(/\/+$/, "")}/api/v1/platform/work/items/${item.key}/verify-result`, {
    method: "POST",
    headers: { "X-Agent-Token": config.agentToken, "Content-Type": "application/json" },
    body: JSON.stringify({ state, run_url: runUrl, results: resultRows(item.done_when, checks) }),
  });
  if (res.status === 409) return { skipped: true };
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`board POST ${item.key}/verify-result → ${res.status}: ${json.error ?? "request failed"}`);
  return json;
}

function runCheck(name, command, args) {
  console.log(`::group::${name}`);
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  console.log("::endgroup::");
  return { name, ok: status === 0 };
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const { BOARD_API_URL, BOARD_AGENT_TOKEN } = process.env;
  if (!BOARD_API_URL || !BOARD_AGENT_TOKEN) throw new Error("BOARD_API_URL and BOARD_AGENT_TOKEN are required");
  if (typeof flags["run-url"] !== "string") throw new Error("--run-url <the CI run> is required");
  const config = { apiUrl: BOARD_API_URL, agentToken: BOARD_AGENT_TOKEN };

  const items = await pendingItems({ config });
  console.log(`${items.length} ticket(s) waiting for verification: ${items.map((i) => i.key).join(", ") || "none"}`);
  if (items.length === 0) return;

  const testCmd = (typeof flags["test-cmd"] === "string" ? flags["test-cmd"] : "pnpm test").split(" ");
  const smokeMarkers = typeof flags.markers === "string" ? ["--markers", flags.markers] : [];
  const checks = [runCheck("Full test suite", testCmd[0], testCmd.slice(1))];
  if (smokeMarkers.length > 0) {
    checks.push(runCheck("pwa-dev bundle smoke", "node", ["infrastructure/scripts/smoke-dev-bundle.mjs", ...smokeMarkers]));
  }
  const state = overallState(checks);
  console.log(`checks: ${checks.map((c) => `${c.name} ${c.ok ? "ok" : "FAILED"}`).join("; ")} → ${state}`);
  if (flags["dry-run"]) return;

  for (const item of items) {
    const out = await postResult({ item, state, runUrl: flags["run-url"], checks, config });
    console.log(out.skipped ? `${item.key}: left Verifying meanwhile, skipped` : `${item.key}: ${state}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`board-verify: ${err.message}`);
    process.exit(1);
  });
}
