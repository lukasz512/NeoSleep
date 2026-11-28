#!/usr/bin/env node
// Logged-in click-through of a deployed PWA (default: pwa-dev) — the second
// half of the post-merge check (the first is smoke-dev-bundle.mjs).
//
// Signs in with the QA account from .claude/local/qa-dev.json (created by
// `pnpm --filter @neo/api seed:qa-user -- --out ../../.claude/local/qa-dev.json`),
// opens each route, waits for it to render, and fails on: a route that
// doesn't render, an uncaught page error, a failed API call (HTTP >= 500), or
// a CSS selector that should exist on that page but doesn't. Saves a
// screenshot per route (desktop + phone) so the result can go into the
// Artifact. Read-only: it never clicks anything that creates, edits or deletes.
//
// Runs in Chromium (desktop + phone) and in WebKit with an iPhone profile:
// Safari and Chrome on iOS both run on WebKit, and a Chromium-only run let a
// login screen that hung on iPhones through (CORE-201). Any error the app
// itself reports to /diagnostics during the run fails the check too, since a
// hang throws no page error.
//
// Usage:
//   node infrastructure/scripts/smoke-dev-ui.mjs --out /tmp/pwa-dev-shots \
//     --check "/patients=.app-avatar__badge" --check "/hcp" --check "/sleep-studies=.identity-details"

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(path.join(ROOT, "apps/pwa/package.json"));
const { chromium, webkit, devices } = require("@playwright/test");

const args = process.argv.slice(2);
let credsFile = path.join(ROOT, ".claude/local/qa-dev.json");
let out = path.join(process.env.TMPDIR ?? "/tmp", "pwa-dev-smoke");
const checks = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--creds") credsFile = args[++i];
  else if (args[i] === "--out") out = args[++i];
  else if (args[i] === "--check") {
    const [route, selector] = args[++i].split("=");
    checks.push({ route, selector: selector || null });
  }
}
if (checks.length === 0) checks.push({ route: "/patients", selector: null });
// Worktrees don't share .claude/local/ — fall back to the main checkout's copy.
if (!fs.existsSync(credsFile)) {
  try {
    const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: ROOT }).toString().trim();
    const mainCopy = path.join(path.dirname(commonDir), ".claude/local/qa-dev.json");
    if (fs.existsSync(mainCopy)) credsFile = mainCopy;
  } catch { /* not a git checkout — keep the default path */ }
}
if (!fs.existsSync(credsFile)) {
  console.error(`No QA credentials at ${credsFile} — create them with: pnpm --filter @neo/api seed:qa-user -- --out ../../.claude/local/qa-dev.json`);
  process.exit(2);
}
const { url: base, email, password } = JSON.parse(fs.readFileSync(credsFile, "utf8"));
fs.mkdirSync(out, { recursive: true });

const problems = [];
const warnings = [];
const browsers = { chromium: await chromium.launch(), webkit: await webkit.launch() };
const runs = [
  { name: "desktop", browser: "chromium", options: { viewport: { width: 1440, height: 900 } } },
  { name: "phone", browser: "chromium", options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  { name: "iphone", browser: "webkit", options: { ...devices["iPhone 15"] } },
];
try {
  for (const viewport of runs) {
    const context = await browsers[viewport.browser].newContext({ ...viewport.options, locale: "en-US" });
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      // Spec-benign, WebKit raises it for any layout that resizes in an observer callback.
      if (e.message.startsWith("ResizeObserver loop")) return;
      problems.push(`[${viewport.name}] page error: ${e.message}`);
    });
    page.on("request", (r) => {
      if (r.method() !== "POST" || !new URL(r.url()).pathname.endsWith("/diagnostics")) return;
      // Warnings include fetches this script itself cuts short by navigating
      // on (WebKit: "Load failed"); only errors fail the check.
      let entry = {};
      try { entry = JSON.parse(r.postData() ?? "{}"); } catch { /* not JSON — treat as an error */ }
      const line = `[${viewport.name}] app reported: ${String(entry.message ?? r.postData()).slice(0, 200)}`;
      (entry.level === "warn" ? warnings : problems).push(line);
    });
    page.on("response", (r) => {
      if (!r.url().includes("/api/") || r.status() < 500) return;
      const line = `[${viewport.name}] ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`;
      // /partners/* proxies a third party (OrthoApnea): its outage is not our
      // deploy's fault, so it's reported but doesn't fail the check.
      (new URL(r.url()).pathname.includes("/partners/") ? warnings : problems).push(line);
    });

    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });

    for (const { route, selector } of checks) {
      // One retry per route: a single blank frame (e.g. the app reloading
      // itself onto a just-deployed version) shouldn't fail the whole check,
      // but a pass-on-retry is still reported so it isn't silently hidden.
      let rendered = false;
      let lastError = "";
      for (let attempt = 1; attempt <= 2 && !rendered; attempt++) {
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
        try {
          await page.locator(".v-data-table, .app-entity-list__feed, main").first().waitFor({ timeout: 30_000 });
          rendered = true;
          if (attempt > 1) warnings.push(`[${viewport.name}] ${route}: blank on first load, rendered on retry (${lastError})`);
        } catch (e) {
          lastError = e.message.split("\n")[0];
        }
      }
      if (!rendered) {
        problems.push(`[${viewport.name}] ${route}: didn't render after 2 attempts (${lastError})`);
      } else {
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(800);
        if (selector) {
          const n = await page.locator(selector).count();
          if (n === 0) problems.push(`[${viewport.name}] ${route}: expected "${selector}" but found none`);
        }
      }
      const file = path.join(out, `${viewport.name}${route.replace(/\//g, "_") || "_root"}.png`);
      await page.screenshot({ path: file });
      console.log(`shot ${file}`);
    }
    await context.close();
  }
} finally {
  await Promise.all(Object.values(browsers).map((b) => b.close()));
}

if (warnings.length) {
  console.log(`\nWARN (not failing):\n  ${[...new Set(warnings)].join("\n  ")}`);
}
if (problems.length) {
  console.log(`\nFAIL — ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nOK — ${checks.length} route(s) × ${runs.length} runs (Chromium desktop/phone, WebKit iPhone) rendered on ${base}, no page errors, no 5xx.`);
