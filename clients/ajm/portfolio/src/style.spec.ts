import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The client's proposal forbids gradients, star ratings and testimonial blocks,
// and the site must stay separate from neoCRM (no @neo/*, @ui, @brand, @i18n, @stores, @api).
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return sources(p);
    return /\.(vue|ts|css)$/.test(d.name) && !d.name.endsWith(".spec.ts") ? [p] : [];
  });
}

const files = sources(join(__dirname));

describe("style › proposal's 'evitar' list", () => {
  it.each(files)("%s has no gradients, stars or testimonials", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/(linear|radial|conic)-gradient\(/);
    expect(src).not.toMatch(/[★☆]|testimonial/i);
  });
});

describe("isolation › no neoCRM imports", () => {
  it.each(files)("%s imports nothing from neoCRM", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/from\s+["'](@neo\/|@ui|@brand|@i18n|@stores|@api|@vuetify)/);
  });
});
