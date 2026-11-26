import { describe, it, expect } from "vitest";
import {
  mirrorActions,
  splitActions,
  toneOf,
  type MirroredAction,
} from "./recordBarActions";

// NEO-158: the phone sticky bar mirrors the record header's own buttons.

function row(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

const btn = (tone: string, label: string, extra = "") =>
  `<button class="view-item__action-btn view-item__action-btn--${tone}" aria-label="${label}" ${extra}><svg data-icon="${label}"></svg></button>`;

describe("toneOf", () => {
  it("reads the tone entityActionBtnClass() gave the button", () => {
    expect(toneOf(row(btn("success", "a")).firstElementChild!)).toBe("success");
    expect(toneOf(row(btn("error", "a")).firstElementChild!)).toBe("error");
    expect(
      toneOf(
        row(
          `<button class="view-item__action-btn view-item__action-btn--inactive"></button>`,
        ).firstElementChild!,
      ),
    ).toBe("neutral");
  });
});

describe("mirrorActions", () => {
  it("lists every button in order with its label, tone, glyph and disabled state", () => {
    const el = row(
      btn("success", "Book") +
        btn("primary", "Edit", "disabled") +
        btn("error", "Delete"),
    );
    const actions = mirrorActions(el);
    expect(actions.map((a) => [a.label, a.tone, a.disabled])).toEqual([
      ["Book", "success", false],
      ["Edit", "primary", true],
      ["Delete", "error", false],
    ]);
    expect(actions[0]!.icon?.getAttribute("data-icon")).toBe("Book");
    expect(actions[2]!.button).toBe(el.querySelectorAll("button")[2]);
  });

  it("treats a loading button as disabled", () => {
    const [a] = mirrorActions(
      row(`<button class="v-btn--loading" aria-label="Activate"></button>`),
    );
    expect(a!.disabled).toBe(true);
  });
});

describe("splitActions", () => {
  const make = (tones: MirroredAction["tone"][]) =>
    mirrorActions(row(tones.map((tone, i) => btn(tone, `a${i}`)).join("")));

  it("keeps the first non-destructive action next to the name, the rest in the menu", () => {
    const { primary, rest } = splitActions(
      make(["success", "success", "primary", "error"]),
    );
    expect(primary?.label).toBe("a0");
    expect(rest.map((a) => a.label)).toEqual(["a1", "a2", "a3"]);
  });

  it("never puts delete next to the name, and lists it last in the menu", () => {
    const { primary, rest } = splitActions(
      make(["error", "primary", "neutral"]),
    );
    expect(primary?.label).toBe("a1");
    expect(rest.map((a) => a.label)).toEqual(["a2", "a0"]);
  });

  it("with only a destructive action there is no primary", () => {
    const { primary, rest } = splitActions(make(["error"]));
    expect(primary).toBeNull();
    expect(rest).toHaveLength(1);
  });
});
