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
// Usage:
//   node infrastructure/scripts/smoke-dev-ui.mjs --out /tmp/pwa-dev-shots \
//     --check "/patients=.app-avatar__badge" --check "/hcp" --check "/sleep-studies=.identity-details"

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(path.join(ROOT, "apps/pwa/package.json"));
const { chromium } = require("@playwright/test");

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
if (!fs.existsSync(credsFile)) {
  console.error(`No QA credentials at ${credsFile} — create them with: pnpm --filter @neo/api seed:qa-user -- --out ../../.claude/local/qa-dev.json`);
  process.exit(2);
}
const { url: base, email, password } = JSON.parse(fs.readFileSync(credsFile, "utf8"));
fs.mkdirSync(out, { recursive: true });

const problems = [];
const warnings = [];
const browser = await chromium.launch();
try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844, mobile: true }]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: !!viewport.mobile,
      hasTouch: !!viewport.mobile,
      deviceScaleFactor: viewport.mobile ? 3 : 1,
      locale: "en-US",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`[${viewport.name}] page error: ${e.message}`));
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
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      try {
        await page.locator(".v-data-table, .app-entity-list__feed, main").first().waitFor({ timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(800);
        if (selector) {
          const n = await page.locator(selector).count();
          if (n === 0) problems.push(`[${viewport.name}] ${route}: expected "${selector}" but found none`);
        }
      } catch (e) {
        problems.push(`[${viewport.name}] ${route}: didn't render (${e.message.split("\n")[0]})`);
      }
      const file = path.join(out, `${viewport.name}${route.replace(/\//g, "_") || "_root"}.png`);
      await page.screenshot({ path: file });
      console.log(`shot ${file}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (warnings.length) {
  console.log(`\nWARN — third-party proxy errors (not failing):\n  ${[...new Set(warnings)].join("\n  ")}`);
}
if (problems.length) {
  console.log(`\nFAIL — ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nOK — ${checks.length} route(s) × 2 viewports rendered on ${base}, no page errors, no 5xx.`);
