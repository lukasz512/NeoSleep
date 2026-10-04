import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * NEO-229: CSS masks read the alpha channel, not luminance. A tooth fill mask
 * saved without alpha paints the whole box green instead of the crown, and a
 * line-art PNG with an opaque canvas hides the form background around it.
 */
const TEETH_DIR = path.resolve(__dirname, "../../assets/orthoapnea/teeth");
const files = readdirSync(TEETH_DIR).filter((f) => /^tooth\d\d(-fill)?\.png$/.test(f));

/** PNG IHDR color type: 4 = grayscale + alpha, 6 = RGBA. */
const colorType = (file: string) => readFileSync(path.join(TEETH_DIR, file))[25];

describe("TeethDiagram assets", () => {
  it("has a line-art PNG and a fill mask for all 32 teeth", () => {
    expect(files).toHaveLength(64);
  });

  it.each(files)("%s carries an alpha channel", (file) => {
    expect([4, 6]).toContain(colorType(file));
  });
});
