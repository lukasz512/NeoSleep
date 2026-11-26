import { describe, it, expect, afterEach, vi } from "vitest";
import { getDialogOrigin } from "./useDialogOrigin";

describe("useDialogOrigin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the last pointerdown coordinates when it happened recently", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    window.dispatchEvent(new MouseEvent("pointerdown", { clientX: 120, clientY: 340 }));
    expect(getDialogOrigin()).toEqual([120, 340]);
  });

  it("falls back to the focused element's center once the pointer position is stale", () => {
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(1000);
    window.dispatchEvent(new MouseEvent("pointerdown", { clientX: 10, clientY: 10 }));

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.getBoundingClientRect = () => ({
      left: 100, top: 200, width: 40, height: 20,
      right: 140, bottom: 220, x: 100, y: 200, toJSON() {},
    });
    button.focus();

    nowSpy.mockReturnValue(1000 + 500); // past the 400ms staleness window

    expect(getDialogOrigin()).toEqual([120, 210]);
    button.remove();
  });

  it("falls back to the viewport center when there is no recent pointer or focused element", () => {
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(1000);
    window.dispatchEvent(new MouseEvent("pointerdown", { clientX: 10, clientY: 10 }));
    nowSpy.mockReturnValue(1000 + 500);

    expect(getDialogOrigin()).toEqual([window.innerWidth / 2, window.innerHeight / 2]);
  });
});
