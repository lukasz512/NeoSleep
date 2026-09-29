/**
 * Rasterizes the brand icon (packages/brand/logos/icon/icon_light.svg) into
 * the PNG/ICO files the web app manifest and index.html point at (NEO-87).
 * Output goes to apps/pwa/public/, which Vite copies to the build root.
 *
 * Browsers need real raster icons to offer "Install app": without a 192 and a
 * 512 PNG in the manifest Chrome refuses the install prompt, and iOS uses a
 * page screenshot for the home-screen icon instead of apple-touch-icon.png.
 *
 * Run after changing the brand icon:  pnpm --filter @neo/pwa icons:generate
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = fs.readFileSync(path.resolve(appDir, "../../packages/brand/logos/icon/icon_light.svg"), "utf8");
const outDir = path.join(appDir, "public");

const BACKGROUND = "#FFFFFF";

/**
 * `scale` = share of the canvas width the logo fills. "any" icons keep a small
 * margin; maskable icons must keep the logo inside the central 80% safe zone
 * (the OS crops to a circle/squircle), hence the smaller logo there.
 */
const ICONS = [
  { file: "icon-192.png", size: 192, scale: 0.78 },
  { file: "icon-512.png", size: 512, scale: 0.78 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.58 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.72 },
  { file: "favicon-32.png", size: 32, scale: 0.94, transparent: true },
  { file: "favicon-48.png", size: 48, scale: 0.94, transparent: true },
];

function page(size, scale, transparent) {
  const bg = transparent ? "transparent" : BACKGROUND;
  return `<!doctype html><html><body style="margin:0;background:${bg}">
    <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
      <div style="width:${size * scale}px">${svg.replace(/<\?xml[^>]*\?>/, "").replace("<svg ", '<svg width="100%" ')}</div>
    </div></body></html>`;
}

/** Wraps PNGs in an .ico container (PNG-in-ICO is supported by every current browser). */
function toIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const tab = await browser.newPage();
const favicons = [];
for (const { file, size, scale, transparent } of ICONS) {
  await tab.setViewportSize({ width: size, height: size });
  await tab.setContent(page(size, scale, transparent));
  const data = await tab.screenshot({ omitBackground: Boolean(transparent) });
  if (file.startsWith("favicon-")) favicons.push({ size, data });
  else fs.writeFileSync(path.join(outDir, file), data);
}
await browser.close();
fs.writeFileSync(path.join(outDir, "favicon.ico"), toIco(favicons));
console.log(`Wrote ${ICONS.length - favicons.length} PNG icons + favicon.ico to ${path.relative(process.cwd(), outDir)}`);
