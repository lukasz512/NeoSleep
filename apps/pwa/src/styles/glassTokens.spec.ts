import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// CORE-119 liquid glass: the surface got more transparent, so the labels on it
// must still pass WCAG AA (4.5:1). jsdom can't composite a backdrop, so the
// check is done on the token values themselves: the surface's opacity mixed
// over a reference backdrop, against the label colour. The blur is ignored
// (it only averages the backdrop, which the reference tones already are).

const css = readFileSync(path.resolve(__dirname, "theme.scss"), "utf-8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {\n  --glass-surface`);
  expect(start, `${selector} glass block`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

function token(body: string, name: string): string {
  const m = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  expect(m, `--${name}`).not.toBeNull();
  return m![1].trim();
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgb: number[]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (top: number[], alpha: number, bottom: number[]) => top.map((c, i) => c * alpha + bottom[i] * (1 - alpha));
const surfaceAlpha = (body: string) => Number(token(body, "glass-surface").match(/(\d+)%/)![1]) / 100;

// Vuetify's default surfaces; the glass mixes from rgb(var(--v-theme-surface)).
const SURFACE = { light: [255, 255, 255], dark: [33, 33, 33] };
// Reference backdrops: the white page, a mid-grey blurred photo, a light photo.
const BACKDROPS = { page: [255, 255, 255], photo: [128, 128, 128], lightPhoto: [220, 220, 220] };

describe("glass tokens (CORE-119 liquid glass)", () => {
  const light = block(":root");
  const dark = block('[data-theme="dark"]');

  it("is more transparent and blurrier than the old 82% / 20px glass", () => {
    expect(surfaceAlpha(light)).toBeLessThan(0.82);
    expect(Number(token(light, "glass-blur").match(/blur\((\d+)px\)/)![1])).toBeGreaterThanOrEqual(24);
  });

  it.each(Object.entries(BACKDROPS))("light labels stay AA over the %s", (_, backdrop) => {
    const bg = over(SURFACE.light, surfaceAlpha(light), backdrop);
    expect(contrast(hex(token(light, "glass-ink")), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(BACKDROPS))("dark labels stay AA over the %s", (_, backdrop) => {
    const bg = over(SURFACE.dark, surfaceAlpha(dark), backdrop);
    expect(contrast(hex(token(dark, "glass-ink")), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("dark mirrors the light recipe (rim + sheen redefined)", () => {
    for (const name of ["glass-edge", "glass-rim", "glass-sheen", "glass-ink"]) {
      expect(token(light, name)).toBeTruthy();
      expect(token(dark, name)).toBeTruthy();
    }
  });

  it("puts the bottom nav labels on the glass ink", () => {
    expect(css).toMatch(/--mobile-bottom-nav-item-color:\s*var\(--glass-ink/);
  });

  // The bug behind the "milky" bar: a view-transition-name makes its element a
  // backdrop root, so the glass inside blurred only its own empty box.
  it("names the chrome for view transitions only while a page change runs", () => {
    const transitions = readFileSync(path.resolve(__dirname, "page-transitions.css"), "utf-8");
    for (const chrome of ["app-shell__bottom-nav", "app-shell__bar"]) {
      const rules = [...transitions.matchAll(new RegExp(`([^{}]*)\\.${chrome}\\s*\\{[^}]*view-transition-name`, "g"))];
      expect(rules.length, chrome).toBeGreaterThan(0);
      for (const [, selector] of rules) expect(selector.trim(), chrome).toMatch(/html\[data-page-transition\]\s*$/);
    }
  });
});
