#!/usr/bin/env node
// ci-health — nightly look at how CI on dev is doing, told to the board (CORE-58).
//
//   node infrastructure/scripts/ci-health.mjs             → summary + board comments
//   node infrastructure/scripts/ci-health.mjs --dry-run   → summary only, nothing is posted
//   node infrastructure/scripts/ci-health.mjs --require   → adds WANTED_CHECKS to the required
//                                                           checks of dev (needs a repo admin's gh login)
//
// Three things are watched, each tells one ticket once:
//   - GREEN_TARGET green CI runs in a row on dev while `tooling` / `api-image` are still
//     optional → TICKETS.required gets the ready change (decision core-58-plan-r1 Q4);
//   - the API test step failed in a dev CI run of the last 24 h → TICKETS.api (Q3);
//   - the flake hunt's ubuntu-latest leg is green NIGHTS_TARGET nights in a row → TICKETS.pin
//     (the CI test job can leave the ubuntu-24.04 pin, CORE-208).
//
// env: GITHUB_REPOSITORY, GH_TOKEN (gh CLI), BOARD_API_URL + BOARD_AGENT_TOKEN (without them
// the summary is still written, with a workflow warning).
// English only (CLAUDE.md). No dependencies beyond Node.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./board.mjs";

export const GREEN_TARGET = 10;
export const NIGHTS_TARGET = 3;
export const WANTED_CHECKS = ["tooling", "api-image"];
export const TICKETS = { required: "CORE-63", api: "CORE-35", pin: "CORE-242" };

const API_STEP = /^Test — api\b/;
const LATEST_LEG = /ubuntu-latest/;
// Runs that say nothing about the code: they neither count nor break a streak.
const NEUTRAL = new Set(["cancelled", "skipped", "neutral"]);
// GitHub Actions, the app that reports the CI jobs as checks.
const ACTIONS_APP_ID = 15368;

/** Successes since the newest failure. `runs` newest first. */
export function greenStreak(runs) {
  let streak = 0;
  for (const run of runs) {
    if (NEUTRAL.has(run.conclusion)) continue;
    if (run.conclusion !== "success") break;
    streak += 1;
  }
  return streak;
}

/** Failed runs (each with its `jobs`) where the API test step is what failed. */
export function apiFailures(failedRuns) {
  return failedRuns
    .filter((run) => run.jobs.some((job) => (job.steps ?? []).some((step) => step.conclusion === "failure" && API_STEP.test(step.name))))
    .map((run) => ({ id: run.id, url: run.html_url }));
}

/** The ruleset PUT body with `contexts` added to its required checks, and which were missing. */
export function withRequiredChecks(ruleset, contexts) {
  const rule = ruleset.rules.find((r) => r.type === "required_status_checks");
  if (!rule) throw new Error(`ruleset ${ruleset.name} has no required_status_checks rule`);
  const current = rule.parameters.required_status_checks;
  const missing = contexts.filter((context) => !current.some((check) => check.context === context));
  const checks = [...current, ...missing.map((context) => ({ context, integration_id: ACTIONS_APP_ID }))];
  const rules = ruleset.rules.map((r) => (r === rule ? { ...r, parameters: { ...r.parameters, required_status_checks: checks } } : r));
  const { name, target, enforcement, conditions, bypass_actors } = ruleset;
  return { missing, body: { name, target, enforcement, conditions, bypass_actors, rules } };
}

/** What the board should hear. `required` null = the rules of dev could not be read. */
export function signals({ runs, required, apiFailed, latestNights }) {
  const out = [];
  const streak = greenStreak(runs);
  const missing = required ? WANTED_CHECKS.filter((check) => !required.includes(check)) : [];
  if (streak >= GREEN_TARGET && missing.length) {
    const proof = runs.filter((run) => run.conclusion === "success").slice(0, GREEN_TARGET);
    out.push({
      ticket: TICKETS.required,
      marker: "<!-- ci-health:required -->",
      body: [
        `${GREEN_TARGET} CI runs in a row on dev are green (${proof[proof.length - 1].html_url} to ${proof[0].html_url}).`,
        `Ready change: make ${missing.join(", ")} required checks on dev, next to test. One command, run by a repo admin (or a Claude session on your yes):`,
        "node infrastructure/scripts/ci-health.mjs --require",
        "It adds only these checks to the ruleset of dev and prints the result; the PWA and web unit tests already block inside the test job.",
      ].join("\n\n"),
    });
  }
  if (apiFailed.length) {
    out.push({
      ticket: TICKETS.api,
      marker: `<!-- ci-health:api:${apiFailed[0].id} -->`,
      body: `The API test step failed in ${apiFailed.length} dev CI run${apiFailed.length === 1 ? "" : "s"} of the last 24 h:\n\n${apiFailed.map((run) => `- ${run.url}`).join("\n")}`,
    });
  }
  if (latestNights >= NIGHTS_TARGET) {
    out.push({
      ticket: TICKETS.pin,
      marker: "<!-- ci-health:pin -->",
      body: `The nightly flake hunt passed on the newer runner image ${NIGHTS_TARGET} nights in a row (WebKit e2e suite, 3 times each, no retries). Ready change: in .github/workflows/ci.yml set the test job to \`runs-on: ubuntu-latest\` and drop the CORE-208 pin comment.`,
    });
  }
  return out;
}

export function healthMarkdown({ runs, required, apiFailed, latestNights }) {
  const counted = runs.filter((run) => !NEUTRAL.has(run.conclusion));
  const red = counted.filter((run) => run.conclusion !== "success").length;
  return [
    "### CI health on dev",
    "",
    `- Green in a row on dev: ${greenStreak(runs)} (target ${GREEN_TARGET}); ${red} of the last ${counted.length} runs failed`,
    `- Required checks on dev: ${required ? required.join(", ") || "none" : "could not be read"}`,
    `- API test step failed in the last 24 h: ${apiFailed.length} runs`,
    `- Flake hunt on ubuntu-latest: green ${latestNights} night(s) in a row (target ${NIGHTS_TARGET})`,
    "",
  ].join("\n");
}

/** Posts each signal as a comment unless the ticket already carries its marker. */
export async function tellBoard({ signals: list, config, fetchImpl = fetch }) {
  const call = async (method, path, payload) => {
    const res = await fetchImpl(`${config.apiUrl.replace(/\/+$/, "")}/api/v1/platform/work${path}`, {
      method,
      headers: { "X-Agent-Token": config.agentToken, ...(payload ? { "Content-Type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`board ${method} ${path} → ${res.status}: ${json.error ?? "request failed"}`);
    return json;
  };
  const out = [];
  for (const signal of list) {
    const { events = [] } = await call("GET", `/items/${signal.ticket}`);
    if (events.some((event) => event.body?.includes(signal.marker))) {
      out.push(`${signal.ticket}: already told`);
      continue;
    }
    await call("POST", `/items/${signal.ticket}/comments`, { body: `${signal.body}\n\n${signal.marker}` });
    out.push(`${signal.ticket}: commented`);
  }
  return out;
}

function gh(path, { method = "GET", input } = {}) {
  const args = ["api", "-X", method, path, ...(input ? ["--input", "-"] : [])];
  return JSON.parse(execFileSync("gh", args, { encoding: "utf-8", input, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }));
}

const warn = (msg) => console.log(`::warning::${msg}`);

/** Completed runs of one workflow on dev, newest first, without the promote PR's mirror runs. */
function devRuns(repo, workflow, query = "") {
  const { workflow_runs: runs } = gh(`repos/${repo}/actions/workflows/${workflow}/runs?branch=dev&status=completed&per_page=40${query}`);
  return runs.filter((run) => run.event !== "pull_request");
}

const jobsOf = (repo, run) => gh(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).jobs;

function requiredChecks(repo) {
  try {
    const rule = gh(`repos/${repo}/rules/branches/dev`).find((r) => r.type === "required_status_checks");
    return (rule?.parameters.required_status_checks ?? []).map((check) => check.context);
  } catch (err) {
    warn(`could not read the rules of dev: ${String(err.message).split("\n")[0]}`);
    return null;
  }
}

/** Nights in a row (newest first) in which the flake hunt's ubuntu-latest leg passed. */
function latestImageNights(repo) {
  let nights = 0;
  let runs;
  try {
    runs = devRuns(repo, "e2e-flake-hunt.yml", "&event=schedule");
  } catch {
    return 0; // the workflow has not run on dev yet
  }
  for (const run of runs.slice(0, NIGHTS_TARGET)) {
    const leg = jobsOf(repo, run).find((job) => LATEST_LEG.test(job.name));
    if (leg?.conclusion !== "success") break;
    nights += 1;
  }
  return nights;
}

function requireChecks(repo) {
  for (const { id } of gh(`repos/${repo}/rulesets`)) {
    const ruleset = gh(`repos/${repo}/rulesets/${id}`);
    if (!ruleset.rules.some((r) => r.type === "required_status_checks")) continue;
    const { missing, body } = withRequiredChecks(ruleset, WANTED_CHECKS);
    if (!missing.length) return console.log(`${ruleset.name}: ${WANTED_CHECKS.join(", ")} are already required.`);
    gh(`repos/${repo}/rulesets/${id}`, { method: "PUT", input: JSON.stringify(body) });
    return console.log(`${ruleset.name}: ${missing.join(", ")} are now required checks.`);
  }
  throw new Error("no ruleset with required status checks found");
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = process.env.GITHUB_REPOSITORY ?? JSON.parse(execFileSync("gh", ["repo", "view", "--json", "nameWithOwner"], { encoding: "utf-8" })).nameWithOwner;
  if (flags.require) return requireChecks(repo);

  const runs = devRuns(repo, "ci.yml");
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const failedToday = runs.filter((run) => run.conclusion === "failure" && Date.parse(run.created_at) >= dayAgo);
  const state = {
    runs,
    required: requiredChecks(repo),
    apiFailed: apiFailures(failedToday.map((run) => ({ ...run, jobs: jobsOf(repo, run) }))),
    latestNights: latestImageNights(repo),
  };
  const summary = healthMarkdown(state);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

  const list = signals(state);
  for (const signal of list) console.log(`→ ${signal.ticket}: ${signal.body.split("\n")[0]}`);
  if (flags["dry-run"] || !list.length) return;
  const { BOARD_API_URL, BOARD_AGENT_TOKEN } = process.env;
  if (!BOARD_API_URL || !BOARD_AGENT_TOKEN) return warn("BOARD_API_URL / BOARD_AGENT_TOKEN are not set: the board was not told.");
  for (const line of await tellBoard({ signals: list, config: { apiUrl: BOARD_API_URL, agentToken: BOARD_AGENT_TOKEN } })) console.log(line);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
