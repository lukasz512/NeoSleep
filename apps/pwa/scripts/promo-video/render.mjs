#!/usr/bin/env node
// NEO-204 — renders compose.html frame by frame into an MP4 with ffmpeg.
//
//   node apps/pwa/scripts/promo-video/render.mjs [--lang en|pl|mx] [--fps 30] [--preview 4,8,14,21,28]
//
// Needs out/shots/* (capture.mjs) and ffmpeg on PATH. The stock photo is
// downloaded on first run (Pexels #7622509, Pexels license: free commercial use,
// no attribution required). Music is a synthesized placeholder pad.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const LANG = arg("lang", "en");
const FPS = Number(arg("fps", "30"));
const PREVIEW = arg("preview", null);
const W = 1080;
const H = 1350;

mkdirSync(join(OUT, "stock"), { recursive: true });
const photo = join(OUT, "stock/wake-up.jpg");
if (!existsSync(photo)) {
  const res = await fetch("https://images.pexels.com/photos/7622509/pexels-photo-7622509.jpeg?auto=compress&w=2400", {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`stock photo download failed: ${res.status}`);
  writeFileSync(photo, Buffer.from(await res.arrayBuffer()));
}

const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(`${pathToFileURL(join(HERE, "compose.html"))}?lang=${LANG}`);
await page.waitForLoadState("load");
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
const duration = await page.evaluate(() => window.DURATION);

async function frameAt(t) {
  await page.evaluate((s) => window.renderAt(s), t);
  return page.screenshot({ type: "png" });
}

if (PREVIEW) {
  for (const s of PREVIEW.split(",").map(Number)) {
    const file = join(OUT, `preview-${LANG}-${String(s).replace(".", "_")}s.png`);
    writeFileSync(file, await frameAt(s));
    console.log(file);
  }
  await browser.close();
  process.exit(0);
}

// Placeholder music: soft A-major pad with a slow swell, fades in and out.
const music = join(OUT, "pad.m4a");
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "lavfi", "-i",
  `aevalsrc='0.08*(sin(2*PI*220*t)+0.7*sin(2*PI*277.18*t)+0.6*sin(2*PI*329.63*t)+0.35*sin(2*PI*440*t)+0.25*sin(2*PI*554.37*t))*(0.75+0.25*sin(2*PI*t/7.5))':s=48000:d=${duration}`,
  "-af", `lowpass=f=1800,aecho=0.8:0.7:120|240:0.25|0.15,afade=t=in:d=1.2,afade=t=out:st=${duration - 2.5}:d=2.5`,
  "-c:a", "aac", "-b:a", "192k", music,
]);

const file = join(OUT, `neosleep-teaser-${LANG}-4x5.mp4`);
const ff = spawn("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-i", music,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "copy", "-shortest",
  file,
], { stdio: ["pipe", "inherit", "inherit"] });

const frames = Math.round(duration * FPS);
for (let i = 0; i < frames; i++) {
  const png = await frameAt(i / FPS);
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % FPS === 0) process.stdout.write(`\r${i / FPS}s / ${duration}s`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg exited ${c}`)))));
await browser.close();
console.log(`\n${file}`);
