#!/usr/bin/env node
// NEO-204 — boots the real PWA on Vite with every /api/v1/** call answered from
// fixtures.mjs (fictional demo data, no DB), and screenshots the screens the
// promo video shows: desktop 1440×900 @2x and phone 390×844 @3x.
//
//   node apps/pwa/scripts/promo-video/capture.mjs   → apps/pwa/scripts/promo-video/out/shots/*.png

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as fx from "./fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PWA = join(HERE, "../..");
const OUT = join(HERE, "out/shots");
const PORT = 5197;
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function api(route) {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^\/api\/v1/, "");
  const q = url.searchParams;
  let m;
  if (path === "/auth/session") return json(route, { user: fx.user });
  if (path === "/auth/refresh") return json(route, { token: "demo", refresh_token: "demo" });
  if (path === "/config/app") return json(route, {});
  if (path === "/config/i18n") return json(route, {});
  if (path === "/lookups/options") return json(route, fx.lookups);
  if (path === "/notification/unread-count") return json(route, { count: 2 });
  if (path === "/diagnostics") return route.fulfill({ status: 204 });
  if (path === "/patient") return json(route, { items: fx.patients, total: fx.patients.length });
  if ((m = path.match(/^\/patient\/([^/]+)$/))) return json(route, fx.patients.find((p) => p.id === m[1]) ?? fx.patients[0]);
  if ((m = path.match(/^\/patient\/([^/]+)\/checklist$/))) return json(route, fx.checklist(m[1]));
  if (path.endsWith("/checklist/version")) return json(route, { version: "v1" });
  if ((m = path.match(/^\/patient\/([^/]+)\/history$/))) return json(route, fx.history(m[1]));
  if (path.endsWith("/sleep-study-ref")) return json(route, { id: "s1" });
  if (path === "/note") return json(route, fx.notes(q.get("entity_id")));
  if (path === "/treatment-plan") return json(route, fx.treatmentPlans(q.get("patient_id")));
  if (path === "/appointments") return json(route, fx.appointments(q.get("start")));
  if (path === "/encounter") return json(route, { items: [] });
  if (path === "/partners/orthoapnea/status") return json(route, { connected: true, attemptsExhausted: false });
  if (path === "/partners/orthoapnea/resources") return json(route, fx.resources);
  if ((m = path.match(/resources\/([^/]+)\/poster$/))) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: fx.poster(m[1]) });
  if (route.request().method() === "GET") return json(route, { items: [], total: 0 });
  return json(route, {});
}

async function waitForVite() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite did not start");
}

const SHOTS = [
  // [name, device, path, text that proves the screen rendered, prepare?]
  ["patients", "desktop", "/patients", "Sofía Ramírez"],
  ["patient-detail", "desktop", "/patients/p1?tab=details", "Informed consent"],
  ["patient-studies", "desktop", "/patients/p1?tab=studies", "Polysomnography"],
  ["patient-treatment", "desktop", "/patients/p1?tab=orthoapnea", "Marco Salinas"],
  ["calendar", "desktop", "/appointments", "Book appointment", async (page) => page.getByRole("button", { name: "Week" }).first().click()],
  ["resources", "desktop", "/resources", "STOP-Bang"],
  ["patients", "phone", "/patients", "Sofía Ramírez"],
  ["patient-detail", "phone", "/patients/p1?tab=details", "Informed consent"],
  ["calendar", "phone", "/appointments", "Sofía"],
  ["resources", "phone", "/resources", "STOP-Bang"],
];

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const vite = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort"], {
  cwd: PWA,
  env: { ...process.env, VITE_API_URL: "" },
  stdio: "ignore",
});
try {
  await waitForVite();
  const browser = await chromium.launch();
  for (const [name, device, path, proof, prepare] of SHOTS) {
    const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: "block", locale: "en-US", colorScheme: "light" });
    await ctx.addInitScript(() => {
      localStorage.setItem("app-refresh-token", "demo");
      localStorage.setItem("app-settings", JSON.stringify({ locale: "en", theme: "light" }));
    });
    await ctx.route("**/api/v1/**", api);
    await ctx.route("**/health", (r) => r.fulfill({ status: 200, body: "ok" }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.warn(`[${name}/${device}] pageerror: ${e.message}`));
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    // Local-only chrome that must not appear in the video.
    await page.addStyleTag({ content: ".layout-env-badge { display: none !important; }" });
    await page.getByText(proof).first().waitFor({ timeout: 30_000 }).catch(() => console.warn(`[${name}/${device}] "${proof}" not found at ${page.url()}`));
    if (prepare) {
      await prepare(page);
      await page.waitForLoadState("networkidle");
    }
    await page.waitForTimeout(1500);
    const file = join(OUT, `${name}-${device}.png`);
    await page.screenshot({ path: file });
    console.log(file);
    await ctx.close();
  }
  await browser.close();
} finally {
  vite.kill();
}
