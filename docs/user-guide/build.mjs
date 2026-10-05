/**
 * Builds the doctor user guide PDF from content/<locale>.json + shots/<locale>/.
 * No app or database needed (shots.mjs makes the pictures).
 *
 *   node docs/user-guide/build.mjs [--locale mx] [--date 2026-10-05] [--png <dir>]
 *
 * meta.date in the content file is the edition date (override with --date).
 * Writes apps/pwa/public/files/<meta.file>; --png also saves one PNG per slide (for review).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DECK, CHAPTERS } from "./slides.mjs";
import { REPO, arg, fill, loadPlaywright } from "./lib.mjs";

const HERE = path.join(REPO, "docs/user-guide");
const LOCALE = arg("locale", "mx");
const DATE_ARG = arg("date", "");
const PNG_DIR = arg("png", "");
const INTL = { mx: "es-MX", en: "en-US", pl: "pl-PL" }[LOCALE] ?? LOCALE;

const content = JSON.parse(fs.readFileSync(path.join(HERE, "content", `${LOCALE}.json`), "utf8"));
const { meta } = content;
const DATE = DATE_ARG || meta.date || new Date().toISOString().slice(0, 10);
const edition = fill(meta.edition, {
  date: new Intl.DateTimeFormat(INTL, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${DATE}T00:00:00Z`)),
});

/** Decorative rings as SVG: PDF viewers distort large CSS border-radius circles. */
const ring = (cls, filled) => `<svg class="ring ${cls}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="49.6" ${filled ? 'class="fill"' : 'class="line" vector-effect="non-scaling-stroke"'}/></svg>`;
const RINGS = { r1: () => ring("r1", true), r2: () => ring("r2", false), r3: () => ring("r3", true) };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fileUrl = (p) => pathToFileURL(p).href;
const LOGO_ON_DARK = fileUrl(path.join(REPO, "packages/brand/logos/logo/logo_dark.svg"));
const LOGO_ON_LIGHT = fileUrl(path.join(REPO, "packages/brand/logos/logo/logo_light.svg"));

const chaptersWithSlides = new Set(DECK.filter((s) => s.kind === "chapter").map((s) => s.id));
const chapterNo = (id) => CHAPTERS.indexOf(id) + 1;

function shot(name) {
  const dir = path.join(HERE, "shots", LOCALE);
  const json = path.join(dir, `${name}.json`);
  if (!fs.existsSync(json)) throw new Error(`missing shot ${LOCALE}/${name} — run shots.mjs first`);
  return { src: fileUrl(path.join(dir, `${name}.png`)), ...JSON.parse(fs.readFileSync(json, "utf8")) };
}

function footer(page, total, chapterId) {
  const chapter = chapterId ? content.chapters[chapterId].title : "";
  return `<footer class="foot"><img src="${LOGO_ON_LIGHT}" alt=""><span>${esc(meta.footer)}${chapter ? ` · ${esc(chapter)}` : ""}</span><span class="pg">${page} / ${total}</span></footer>`;
}

function cover() {
  const visual = shot("login");
  return `<section class="slide cover">
    ${RINGS.r1()}${RINGS.r2()}${RINGS.r3()}
    <div class="cover-text">
      <img class="cover-logo" src="${LOGO_ON_DARK}" alt="NeoSleep">
      <h1>${esc(meta.title)}</h1>
      <p class="cover-sub">${esc(meta.subtitle)}</p>
      <p class="cover-ed">${esc(edition)}</p>
    </div>
    <div class="cover-visual"><img src="${visual.src}" alt=""></div>
  </section>`;
}

function toc(page, total) {
  const rows = CHAPTERS.map((id) => {
    const c = content.chapters[id];
    const ready = chaptersWithSlides.has(id);
    const inner = `<span class="toc-n">${String(chapterNo(id)).padStart(2, "0")}</span>
      <span class="toc-t"><b>${esc(c.title)}</b><small>${esc(c.lead)}</small></span>
      ${ready ? "" : `<span class="toc-soon">${esc(meta.upcoming)}</span>`}`;
    return ready ? `<a class="toc-row" href="#ch-${id}">${inner}</a>` : `<div class="toc-row is-soon">${inner}</div>`;
  }).join("");
  return `<section class="slide toc"><h2>${esc(meta.toc)}</h2><div class="toc-list">${rows}</div>${footer(page, total)}</section>`;
}

function chapter(slide, page, total) {
  const c = content.chapters[slide.id];
  return `<section class="slide chapter" id="ch-${slide.id}">
    ${RINGS.r1()}${RINGS.r2()}
    <p class="chapter-label">${esc(fill(meta.chapterLabel, { n: chapterNo(slide.id) }))}</p>
    <h2>${esc(c.title)}</h2>
    <p class="chapter-lead">${esc(c.lead)}</p>
    ${footer(page, total)}
  </section>`;
}

function task(slide, page, total, chapterId) {
  const t = content.slides[slide.id];
  if (!t) throw new Error(`content/${LOCALE}.json has no slides.${slide.id}`);
  const s = shot(slide.shot);
  if (s.markers.length !== t.steps.length) {
    throw new Error(`${slide.id}: ${t.steps.length} steps but ${s.markers.length} markers on the shot`);
  }
  const markers = s.markers.map((m, i) => {
    const left = Math.max(18, m.x - 22) / s.size.width * 100;
    const top = (m.y + m.h / 2) / s.size.height * 100;
    return `<span class="mk" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%">${i + 1}</span>`;
  }).join("");
  const steps = t.steps.map((st) => `<li>${esc(st)}</li>`).join("");
  const ratio = s.size.width / s.size.height;
  return `<section class="slide task">
    <div class="task-text">
      <p class="eyebrow">${esc(content.chapters[chapterId].title)}</p>
      <h2>${esc(t.title)}</h2>
      <p class="lead">${esc(t.lead)}</p>
      <ol class="steps">${steps}</ol>
      ${t.tip ? `<p class="tip">${esc(t.tip)}</p>` : ""}
    </div>
    <div class="task-shot"><figure style="aspect-ratio:${ratio.toFixed(4)}"><img src="${s.src}" alt="">${markers}</figure></div>
    ${footer(page, total, chapterId)}
  </section>`;
}

function render() {
  const total = DECK.length;
  let chapterId = null;
  const body = DECK.map((slide, i) => {
    const page = i + 1;
    if (slide.kind === "cover") return cover();
    if (slide.kind === "toc") return toc(page, total);
    if (slide.kind === "chapter") { chapterId = slide.id; return chapter(slide, page, total); }
    return task(slide, page, total, chapterId);
  }).join("\n");
  return `<!doctype html><html lang="${INTL}"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${fileUrl(path.join(HERE, "deck.css"))}"></head><body>${body}</body></html>`;
}

const buildDir = path.join(HERE, ".build");
fs.mkdirSync(buildDir, { recursive: true });
const htmlPath = path.join(buildDir, `${LOCALE}.html`);
fs.writeFileSync(htmlPath, render());

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.goto(fileUrl(htmlPath), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

const pdfPath = path.join(REPO, "apps/pwa/public/files", meta.file);
await page.pdf({ path: pdfPath, width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });
console.log(`[guide] ${path.relative(REPO, pdfPath)} (${DECK.length} slides, ${Math.round(fs.statSync(pdfPath).size / 1024)} KB)`);

if (PNG_DIR) {
  fs.mkdirSync(PNG_DIR, { recursive: true });
  const slides = page.locator("section.slide");
  const n = await slides.count();
  for (let i = 0; i < n; i++) await slides.nth(i).screenshot({ path: path.join(PNG_DIR, `${String(i + 1).padStart(2, "0")}.png`) });
  console.log(`[guide] ${n} slide previews in ${PNG_DIR}`);
}
await browser.close();
