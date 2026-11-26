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
 * Dev deploy variant (CORE-178, option C): orange tile, orange-shifted logo
 * and a "DEV" strip, so an installed pwa-dev never looks like prod.
 * src/config/pwaBranding.ts points the dev manifest at these files.
 */
const DEV = { background: "#FFE8D6", strip: "#E8590C", logoFilter: "hue-rotate(210deg) saturate(2.2)" };

/**
 * `scale` = share of the canvas width the logo fills. "any" icons keep a small
 * margin; maskable icons must keep the logo inside the central 80% safe zone
 * (the OS crops to a circle/squircle), hence the smaller logo there — and the
 * dev strip sits above the bottom 10% the crop can cut (`stripBottom`).
 */
const ICONS = [
  { file: "icon-192.png", size: 192, scale: 0.78 },
  { file: "icon-512.png", size: 512, scale: 0.78 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.58 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.72 },
  { file: "favicon-32.png", size: 32, scale: 0.94, transparent: true },
  { file: "favicon-48.png", size: 48, scale: 0.94, transparent: true },
  { file: "icon-dev-192.png", size: 192, scale: 0.62, dev: true },
  { file: "icon-dev-512.png", size: 512, scale: 0.62, dev: true },
  { file: "icon-dev-maskable-512.png", size: 512, scale: 0.46, dev: true, stripBottom: 0.14 },
  { file: "apple-touch-icon-dev.png", size: 180, scale: 0.6, dev: true },
];

function page(size, scale, transparent, dev, stripBottom = 0) {
  const bg = transparent ? "transparent" : dev ? DEV.background : BACKGROUND;
  const logo = svg.replace(/<\?xml[^>]*\?>/, "").replace("<svg ", '<svg width="100%" ');
  // The logo shifts up so the strip below never covers it.
  const strip = dev
    ? `<div style="position:absolute;left:0;right:0;bottom:${size * stripBottom}px;height:${size * 0.22}px;
        background:${DEV.strip};color:#fff;display:flex;align-items:center;justify-content:center;
        font:800 ${size * 0.15}px/1 system-ui,-apple-system,Helvetica,Arial,sans-serif;letter-spacing:${size * 0.012}px">DEV</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:${bg}">
    <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
      <div style="width:${size * scale}px;${dev ? `filter:${DEV.logoFilter};margin-bottom:${size * (0.22 + stripBottom)}px` : ""}">${logo}</div>
      ${strip}
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
for (const { file, size, scale, transparent, dev, stripBottom } of ICONS) {
  await tab.setViewportSize({ width: size, height: size });
  await tab.setContent(page(size, scale, transparent, dev, stripBottom));
  const data = await tab.screenshot({ omitBackground: Boolean(transparent) });
  if (file.startsWith("favicon-")) favicons.push({ size, data });
  else fs.writeFileSync(path.join(outDir, file), data);
}
await browser.close();
fs.writeFileSync(path.join(outDir, "favicon.ico"), toIco(favicons));
console.log(`Wrote ${ICONS.length - favicons.length} PNG icons + favicon.ico to ${path.relative(process.cwd(), outDir)}`);
