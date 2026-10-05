/**
 * Takes the guide's screenshots from a LOCAL app seeded with the demo doctor
 * (apps/api/scripts/seed-guide-data.ts). Never point it at dev or prod.
 *
 *   node docs/user-guide/shots.mjs [--locale mx] [--base http://localhost:5420] [--only login,forgot]
 *
 * Writes shots/<locale>/<name>.png (2x) and <name>.json (marker boxes in CSS px).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS } from "./slides.mjs";
import { loadPlaywright, arg } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCALE = arg("locale", "mx");
const BASE = arg("base", "http://localhost:5420");
const ONLY = arg("only", "").split(",").filter(Boolean);
const BROWSER_LOCALE = { mx: "es-MX", en: "en-US", pl: "pl-PL" }[LOCALE] ?? LOCALE;
const VIEWPORT = { width: 1280, height: 800 };
const DOCTOR = { email: "dra.demo@neosleepcare.local", password: "guia-local-only-password" };

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  throw new Error(`shots only run against a local app (got ${BASE})`);
}

/** Hides what only exists on a local build: the LOCAL badge and the "· LOCAL" version suffix. */
const CLEAN_CSS = `.layout-env-badge { display: none !important; }
*, *::before, *::after { caret-color: transparent !important; }`;

async function settle(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() =>
    document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).every((a) => a.playState !== "running"),
  );
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length === 0 && /·\s*LOCAL$/.test(el.textContent ?? "")) el.textContent = el.textContent.replace(/\s*·\s*LOCAL$/, "");
    }
  });
  await page.waitForTimeout(200);
}

/** The element's box plus a margin (room for the markers), kept inside the viewport. */
async function clipAround(locator, pad = 28) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("clipTo element not visible");
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  return {
    x, y,
    width: Math.min(VIEWPORT.width - x, Math.ceil(box.width + pad * 2)),
    height: Math.min(VIEWPORT.height - y, Math.ceil(box.height + pad * 2)),
  };
}

async function signIn(page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').first().fill(DOCTOR.email);
  await page.locator('input[type="password"]').first().fill(DOCTOR.password);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const out = path.join(HERE, "shots", LOCALE);
fs.mkdirSync(out, { recursive: true });

const contexts = {};
async function pageFor(auth) {
  const key = auth ? "auth" : "anon";
  if (!contexts[key]) {
    const ctx = await browser.newContext({
      serviceWorkers: "block", viewport: VIEWPORT, deviceScaleFactor: 2,
      locale: BROWSER_LOCALE, timezoneId: "America/Mexico_City", reducedMotion: "reduce",
    });
    await ctx.addInitScript((css) => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = css;
        document.head.append(s);
      });
    }, CLEAN_CSS);
    const page = await ctx.newPage();
    // The first load compiles the app on the Vite dev server; give it time once.
    page.setDefaultTimeout(30_000);
    if (auth) await signIn(page);
    contexts[key] = page;
  }
  return contexts[key];
}

for (const shot of Object.values(SHOTS)) {
  if (ONLY.length && !ONLY.includes(shot.name)) continue;
  const page = await pageFor(shot.auth);
  await shot.run(page, { base: BASE });
  await settle(page);
  const clip = shot.clip ?? (shot.clipTo ? await clipAround(shot.clipTo(page)) : { x: 0, y: 0, ...VIEWPORT });
  const markers = [];
  for (const marker of shot.markers(page)) {
    const { loc, side = "left" } = "loc" in marker ? marker : { loc: marker };
    const box = await loc.boundingBox({ timeout: 8000 }).catch(() => null);
    if (!box) throw new Error(`${shot.name}: marker ${markers.length + 1} not visible`);
    markers.push({ x: Math.round(box.x - clip.x), y: Math.round(box.y - clip.y), w: Math.round(box.width), h: Math.round(box.height), side });
  }
  await page.screenshot({ path: path.join(out, `${shot.name}.png`), clip });
  fs.writeFileSync(path.join(out, `${shot.name}.json`), JSON.stringify({ size: { width: clip.width, height: clip.height }, markers }, null, 2) + "\n");
  console.log(`[shots] ${LOCALE}/${shot.name} (${markers.length} markers)`);
}

await browser.close();
