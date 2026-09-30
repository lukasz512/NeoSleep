#!/usr/bin/env node
// NEO-204 — renders compose.html frame by frame into an MP4 with ffmpeg.
//
//   node apps/pwa/scripts/promo-video/render.mjs [--lang en|pl|mx] [--format 4x5|9x16]
//        [--music calm|uplifting|pad] [--duration 30|20|15] [--fps 30] [--preview 4,8,14,21,28]
//
// Needs out/shots/* (capture.mjs) and ffmpeg on PATH. Downloaded on first run:
// the opening photo (Pexels #7622509, Pexels license) and the music tracks
// (Pixabay Content License) — all free for commercial use, no attribution needed.
// "pad" is a synthesized placeholder.

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
const FORMAT = arg("format", "4x5");
const MUSIC = arg("music", "calm");
const DURATION = arg("duration", "30");
const W = 1080;
const H = FORMAT === "9x16" ? 1920 : 1350;

// [url, start offset in seconds] — the offset skips a slow intro.
const TRACKS = {
  // "Calm Background For Video" by lvymusic — https://pixabay.com/music/corporate-calm-background-for-video-121519/
  calm: ["https://cdn.pixabay.com/download/audio/2022/10/01/audio_2555cfa014.mp3", 0],
  // "Inspiring Uplifting Background (Fading Traces)" by Coma-Media — https://pixabay.com/music/corporate-inspiring-uplifting-background-12785/
  uplifting: ["https://cdn.pixabay.com/download/audio/2021/12/24/audio_e4f3eba6bf.mp3", 0],
};

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
await page.goto(`${pathToFileURL(join(HERE, "compose.html"))}?lang=${LANG}&format=${FORMAT}&duration=${DURATION}`);
await page.waitForLoadState("load");
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
const duration = await page.evaluate(() => window.DURATION);

async function download(url, file) {
  if (existsSync(file)) return;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function frameAt(t) {
  await page.evaluate((s) => window.renderAt(s), t);
  return page.screenshot({ type: "png" });
}

if (PREVIEW) {
  for (const s of PREVIEW.split(",").map(Number)) {
    const file = join(OUT, `preview-${LANG}-${FORMAT}-${DURATION}s-${String(s).replace(".", "_")}s.png`);
    writeFileSync(file, await frameAt(s));
    console.log(file);
  }
  await browser.close();
  process.exit(0);
}

const music = join(OUT, `music-${MUSIC}.m4a`);
const fades = `afade=t=in:d=0.6,afade=t=out:st=${duration - 2.5}:d=2.5`;
if (MUSIC === "pad") {
  // Placeholder: soft A-major pad with a slow swell.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i",
    `aevalsrc='0.08*(sin(2*PI*220*t)+0.7*sin(2*PI*277.18*t)+0.6*sin(2*PI*329.63*t)+0.35*sin(2*PI*440*t)+0.25*sin(2*PI*554.37*t))*(0.75+0.25*sin(2*PI*t/7.5))':s=48000:d=${duration}`,
    "-af", `lowpass=f=1800,aecho=0.8:0.7:120|240:0.25|0.15,${fades}`,
    "-c:a", "aac", "-b:a", "192k", music,
  ]);
} else {
  const [url, offset] = TRACKS[MUSIC] ?? TRACKS.calm;
  const src = join(OUT, "music", `${MUSIC}.mp3`);
  mkdirSync(dirname(src), { recursive: true });
  await download(url, src);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", String(offset), "-t", String(duration), "-i", src,
    "-af", `loudnorm=I=-16:TP=-1.5,${fades}`,
    "-c:a", "aac", "-b:a", "192k", music,
  ]);
}

const file = join(OUT, `neosleep-teaser-${LANG}-${FORMAT}-${DURATION}s-${MUSIC}.mp4`);
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
