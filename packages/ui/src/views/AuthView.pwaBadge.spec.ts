// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { BRAND_PWA_BADGE_URL } from "@brand/logos";

// NEO-12: the PWA badge under the login card must read as light-on-teal —
// white P and A, a light lavender W — instead of the original dark grey
// (#3d3d3d) + saturated purple (#5a0fc8), which clashed with the login page.

interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

// Minimal decoder for the only format this asset uses: 8-bit RGBA, non-interlaced.
function decodeRgbaPng(buf: Buffer): DecodedPng {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [bitDepth, colorType, , , interlace] = data.subarray(8);
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error("pwa-badge.png must stay 8-bit RGBA, non-interlaced");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rgba[y * stride + x] = (cur + predicted) & 0xff;
    }
  }
  return { width, height, rgba };
}

function loadBadge(): DecodedPng {
  // BRAND_PWA_BADGE_URL is served from packages/brand ("/brand/..." → packages/brand/...).
  const relative = BRAND_PWA_BADGE_URL.replace(/^\/brand\//, "");
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "../../../brand", relative);
  return decodeRgbaPng(readFileSync(path));
}

function opaqueColorCounts(png: DecodedPng): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < png.rgba.length; i += 4) {
    if (png.rgba[i + 3] !== 255) continue;
    const hex = [0, 1, 2].map((k) => png.rgba[i + k].toString(16).padStart(2, "0")).join("");
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return counts;
}

describe("PWA badge asset (NEO-12)", () => {
  it("uses white and light lavender (#c4b5fd) as its two dominant colors", () => {
    const counts = opaqueColorCounts(loadBadge());
    const topTwo = [...counts.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 2)
      .map(([hex]) => hex)
      .sort();
    expect(topTwo).toEqual(["c4b5fd", "ffffff"]);
  });

  it("has no dark or saturated-purple pixels left from the old badge", () => {
    const png = loadBadge();
    let darkPixels = 0;
    for (let i = 0; i < png.rgba.length; i += 4) {
      if (png.rgba[i + 3] === 0) continue;
      // Darkest channel of every visible pixel stays bright — rules out both
      // the #3d3d3d grey and the #5a0fc8 purple (and their anti-aliased blends).
      if (Math.min(png.rgba[i], png.rgba[i + 1], png.rgba[i + 2]) < 0xb5) darkPixels++;
    }
    expect(darkPixels).toBe(0);
  });
});
