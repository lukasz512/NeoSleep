/**
 * NEO-236: every light-mode text/background pair of the main palette passes
 * WCAG AA (4.5:1 for normal text). Reads the tokens from their sources so a
 * future palette tweak can't silently drop below AA.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { brandColors } from "@brand/colors";
import { lightNeutrals } from "@vuetify";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themeScss = readFileSync(resolve(__dirname, "theme.scss"), "utf8");
// The first :root block holds the light tokens; dark ones follow under [data-theme="dark"].
const lightBlock = themeScss.slice(0, themeScss.indexOf('[data-theme="dark"]'));

function token(name: string): string {
  const match = lightBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`--${name} is not a 6-digit hex in the light theme block`);
  return match[1];
}

const AA = 4.5;

describe("light palette contrast (NEO-236)", () => {
  const surface = lightNeutrals.surface;
  const page = lightNeutrals.background;

  it.each([
    ["text on card", () => token("pwa-text"), () => surface],
    ["secondary text on card", () => token("pwa-text-secondary"), () => surface],
    ["secondary text on page", () => token("pwa-text-secondary"), () => page],
    ["primary on card", () => brandColors.appPrimary, () => surface],
    ["primary on page", () => brandColors.appPrimary, () => page],
    ["white on primary button", () => "#FFFFFF", () => brandColors.appPrimary],
    ["white on primary hover", () => "#FFFFFF", () => brandColors.appPrimaryHover],
    ["Vuetify on-surface on card", () => lightNeutrals["on-surface"], () => surface],
  ])("%s passes AA", (_label, fg, bg) => {
    expect(contrast(fg(), bg())).toBeGreaterThanOrEqual(AA);
  });

  it("the card is a warm white, not pure white (D2)", () => {
    expect(surface.toUpperCase()).toBe("#FFFCF6");
  });

  it("the app primary is darker than the logo teal, which stays the brand mark", () => {
    expect(brandColors.primary).toBe("#128F83");
    expect(luminance(brandColors.appPrimary)).toBeLessThan(luminance(brandColors.primary));
  });

  it("SCSS primary matches brandColors.appPrimary", () => {
    const scss = readFileSync(resolve(__dirname, "_brand-colors.scss"), "utf8");
    expect(scss).toContain(`$pwa-brand-primary: ${brandColors.appPrimary};`);
    expect(scss).toContain(`$pwa-brand-primary-hover: ${brandColors.appPrimaryHover};`);
  });
});
