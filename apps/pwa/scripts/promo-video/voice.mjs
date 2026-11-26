#!/usr/bin/env node
// NEO-204 — adds the voice-over (voiceover.json) to a rendered teaser without
// re-rendering the picture: each line is placed at its timecode, sped up only
// if it would overrun its slot, and the music ducks under the voice.
//
//   node apps/pwa/scripts/promo-video/voice.mjs --lang en --in out/neosleep-teaser-en-4x5-calm.mp4
//     → out/neosleep-teaser-en-4x5-calm-vo-draft.mp4   (macOS `say` draft voices)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const LANG = arg("lang", "en");
const input = resolve(HERE, arg("in", `out/neosleep-teaser-${LANG}-4x5-calm.mp4`));
const { draftVoice, lines } = JSON.parse(readFileSync(join(HERE, "voiceover.json"), "utf-8"));
const script = lines[LANG];
if (!script) throw new Error(`no voice-over lines for "${LANG}"`);

const tmp = join(HERE, "out/vo", LANG);
mkdirSync(tmp, { recursive: true });
const duration = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf-8" }));

// 1. One clip per line, fitted to its slot (at most 20% faster, never slower).
const clips = script.map(([start, end, text], i) => {
  const file = join(tmp, `line-${i}.aiff`);
  execFileSync("say", ["-v", draftVoice[LANG], "-r", "175", "-o", file, text]);
  const len = duration(file);
  const tempo = Math.min(1.2, Math.max(1, len / (end - start)));
  if (len / tempo > end - start + 0.05) console.warn(`line ${i + 1} runs ${(len / tempo - (end - start)).toFixed(2)} s past its slot`);
  return { file, start, tempo };
});

// 2. Voice track, then music ducked under it (sidechain), then both together.
const inputs = ["-i", input, ...clips.flatMap((c) => ["-i", c.file])];
const placed = clips
  .map((c, i) => `[${i + 1}:a]aresample=48000,atempo=${c.tempo.toFixed(3)},adelay=${Math.round(c.start * 1000)}:all=1[v${i}]`)
  .join(";");
const filter = [
  placed,
  `${clips.map((_, i) => `[v${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,volume=1.8,asplit=2[vo][key]`,
  `[0:a][key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[bed]`,
  `[bed][vo]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]`,
].join(";");

const out = join(dirname(input), basename(input, ".mp4") + "-vo-draft.mp4");
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", ...inputs,
  "-filter_complex", filter,
  "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(duration(input)),
  out,
]);
console.log(out);
