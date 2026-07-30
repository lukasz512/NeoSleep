// Fallback only — real (possibly tenant-overridden) value is read from
// --pwa-primary at render time, see packages/stores/src/config.ts applyToDom().
const FALLBACK_PRIMARY_HEX = "#128F83";

// Degrees the hue is allowed to drift from the brand primary across a-z, and
// the saturation floor it fades toward — both centered on the primary color
// so every generated avatar still reads as "this app's color", just not
// identical for every identity.
const HUE_SPREAD_DEG = 70;
const MIN_SATURATION_PCT = 45;

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function primaryHsl(): { h: number; s: number; l: number } {
  const cssValue =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--pwa-primary").trim()
      : "";
  return hexToHsl(cssValue || FALLBACK_PRIMARY_HEX);
}

/**
 * Derives an avatar background color from the brand primary, varied by the
 * seed's first letter: "a" sits at one edge of the hue spread at full
 * saturation, "z" at the other edge with saturation faded toward the floor.
 * Lightness is left untouched so contrast against white initials/icons stays
 * constant no matter which tenant's primary color this resolves from.
 */
export function getAvatarColor(seed: string): string {
  const { h, s, l } = primaryHsl();
  const letter = seed.trim().toLowerCase().match(/[a-z]/)?.[0] ?? "a";
  const t = (letter.charCodeAt(0) - 97) / 25; // "a" -> 0, "z" -> 1

  const hue = (h - HUE_SPREAD_DEG / 2 + t * HUE_SPREAD_DEG + 360) % 360;
  const saturation = Math.max(MIN_SATURATION_PCT, s - t * (s - MIN_SATURATION_PCT));

  return `hsl(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${l.toFixed(0)}%)`;
}
