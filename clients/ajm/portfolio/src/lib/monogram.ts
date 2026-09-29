/**
 * The pinned AJ sketch (Łukasz, 2026-09-29): the page stops on the monogram for about two scroll
 * swipes, and that scroll draws it: construction lines → outline → pencil hatching → solid ink;
 * once it is inked the construction lines fade out, and only then does the page move on.
 */

/** Extra scroll the page is held for, in screen heights. */
export const MONO_PIN_SCREENS = 1.8;

const span = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));

export interface MonoStages {
  guide: number;
  draw: number;
  hatch: number;
  fill: number;
  guidesOut: number;
  /** scale of the whole blueprint: very large at first, settling to 1 as the outline completes */
  zoom: number;
}

/** how large the blueprint starts (Łukasz, 2026-09-29: "first really big, then smaller as it draws") */
const ZOOM_FROM = 2.8;

/** Stage values (0…1) for the progress through the pinned stretch. */
export function monoStages(p: number): MonoStages {
  return {
    guide: span(p, 0.02, 0.34),
    draw: span(p, 0.3, 0.54),
    hatch: span(p, 0.5, 0.66),
    fill: span(p, 0.62, 0.78),
    guidesOut: span(p, 0.8, 0.94),
    // ease-out: it closes in quickly at first, then settles gently onto its size
    zoom: 1 + (ZOOM_FROM - 1) * (1 - span(p, 0, 0.54)) ** 2,
  };
}
