#!/usr/bin/env node
// NEO-204 — boots the real PWA on Vite with every /api/v1/** call answered from
// fixtures.mjs (fictional demo data, no DB), and screenshots the screens the
// promo video shows: desktop 1440×900 @2x and phone 390×844 @3x.
//
//   node apps/pwa/scripts/promo-video/capture.mjs [--lang en|pl|mx]   → out/shots/<lang>/*.png
//   PWA_DIR=<other worktree>/apps/pwa …   captures another checkout's app (e.g. an unmerged UI fix)

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as fx from "./fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PWA = process.env.PWA_DIR ?? join(HERE, "../..");
const langArg = process.argv.indexOf("--lang");
const LANG = langArg > 0 ? process.argv[langArg + 1] : "en";
const BROWSER_LOCALE = { en: "en-US", pl: "pl-PL", mx: "es-MX" }[LANG] ?? "en-US";
const OUT = join(HERE, "out/shots", LANG);
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
  if (path === "/note") return json(route, fx.notes(q.get("entity_id"), LANG));
  if (path === "/treatment-plan") return json(route, fx.treatmentPlans(q.get("patient_id")));
  // CORE-117: Planificador + Citas merged into one Calendario screen reading /api/v1/calendar —
  // the old /appointments fixture still supplies the data, just tagged and wrapped as a union item.
  if (path === "/calendar") {
    const items = fx.appointments(q.get("start")).items.map((a) => ({ kind: "appointment", id: a.id, start_at: a.start_at, end_at: a.end_at, data: a }));
    return json(route, { items });
  }
  if (path === "/encounter") return json(route, { items: [] });
  if (path === "/partners/orthoapnea/status") return json(route, { connected: true, attemptsExhausted: false });
  if (path === "/partners/orthoapnea/resources") return json(route, fx.resources(LANG));
  if ((m = path.match(/resources\/([^/]+)\/poster$/))) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: fx.poster(m[1], LANG) });
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
  ["patient-detail", "desktop", "/patients/p1?tab=details", "NS-2400"],
  ["calendar", "desktop", "/calendar", "Sofía", async (page) => page.locator("button[value=week]").first().click()],
  ["resources", "desktop", "/resources", "STOP-Bang"],
  ["patients", "phone", "/patients", "Sofía Ramírez"],
  ["calendar", "phone", "/calendar", "Sofía"],
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
    const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: "block", locale: BROWSER_LOCALE, colorScheme: "light" });
    await ctx.addInitScript((locale) => {
      localStorage.setItem("app-refresh-token", "demo");
      localStorage.setItem("app-settings", JSON.stringify({ locale, theme: "light" }));
    }, LANG);
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
