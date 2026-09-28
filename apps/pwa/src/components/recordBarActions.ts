import type { EntityActionTone } from "../config/entityActions";

/** One header action as the sticky bar shows it (NEO-158). */
export interface MirroredAction {
  /** Position in the header — stable enough for a v-for key between mutations. */
  readonly key: number;
  readonly label: string;
  readonly tone: EntityActionTone;
  readonly disabled: boolean;
  /** The header's own button — tapping the bar's copy clicks this one. */
  readonly button: HTMLElement;
  /** The button's glyph, copied into the bar. */
  readonly icon: SVGElement | null;
}

const TONES: readonly EntityActionTone[] = ["success", "primary", "error"];

/** The tone config/entityActions.ts gave the button (view-item__action-btn--<tone>), else neutral. */
export function toneOf(button: Element): EntityActionTone {
  for (const tone of TONES)
    if (button.classList.contains(`view-item__action-btn--${tone}`))
      return tone;
  return "neutral";
}

/** Reads the header's actions — every button in its row, in order. */
export function mirrorActions(container: Element): MirroredAction[] {
  const buttons = Array.from(
    container.querySelectorAll<HTMLElement>("button, a[href]"),
  );
  return buttons.map((button, key) => ({
    key,
    label: (
      button.getAttribute("aria-label") ??
      button.textContent ??
      ""
    ).trim(),
    tone: toneOf(button),
    disabled:
      button.hasAttribute("disabled") ||
      button.getAttribute("aria-disabled") === "true" ||
      button.classList.contains("v-btn--loading"),
    button,
    icon: button.querySelector("svg"),
  }));
}

/**
 * The bar has room for one action next to the name: the first one that isn't
 * destructive (the view lists its main action first). Everything else goes
 * into "⋯", with destructive actions (delete) at the bottom of that menu.
 */
export function splitActions(actions: readonly MirroredAction[]): {
  primary: MirroredAction | null;
  rest: MirroredAction[];
} {
  const primary = actions.find((a) => a.tone !== "error") ?? null;
  const others = actions.filter((a) => a !== primary);
  const rest = [
    ...others.filter((a) => a.tone !== "error"),
    ...others.filter((a) => a.tone === "error"),
  ];
  return { primary, rest };
}
