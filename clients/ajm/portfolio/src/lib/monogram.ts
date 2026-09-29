/**
 * The pinned AJ sketch (Łukasz, 2026-09-29): the page stops on the monogram and the scroll draws it:
 * construction lines → outline → pencil hatching → solid ink; the construction lines then fade.
 * The blueprint starts very large and closes in to its size while the outline is drawn, keeps
 * shrinking gently, and ends in the lockup: the mark slides left and "Management" is written beside
 * it. Only then does the page move on.
 */

/** Extra scroll the page is held for, in screen heights. */
export const MONO_PIN_SCREENS = 2.4;

const span = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
/** smootherstep: zero speed at both ends, so nothing starts or stops with a jolt */
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export interface MonoStages {
  guide: number;
  draw: number;
  hatch: number;
  fill: number;
  guidesOut: number;
  /** scale of the whole blueprint: very large at first, 1 when the outline is done, then smaller */
  zoom: number;
  /** 0 → 1: the mark slides left to make room for the word */
  shift: number;
  /** 0 → 1: "Management" is revealed beside the mark */
  word: number;
}

/** how large the blueprint starts ("first really big, then smaller as it draws") */
const ZOOM_FROM = 2.8;
/** how small it ends, in the lockup ("it should shrink even more") */
const ZOOM_TO = 0.5;

/** Stage values for the progress (0…1) through the pinned stretch. */
export function monoStages(p: number): MonoStages {
  return {
    guide: span(p, 0.02, 0.26),
    draw: span(p, 0.22, 0.42),
    hatch: span(p, 0.4, 0.52),
    fill: span(p, 0.49, 0.6),
    guidesOut: span(p, 0.6, 0.7),
    zoom:
      p < 0.42
        ? 1 + (ZOOM_FROM - 1) * (1 - smooth(span(p, 0, 0.42)))
        : 1 - (1 - ZOOM_TO) * smooth(span(p, 0.6, 0.95)),
    shift: smooth(span(p, 0.7, 0.9)),
    word: span(p, 0.8, 0.95),
  };
}
