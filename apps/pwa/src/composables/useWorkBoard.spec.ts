import { describe, it, expect } from "vitest";
import { asChecklist, checklistLines, checklistProgress, toggleChecklistLine } from "./useWorkBoard";

/** "Done when" is a markdown task list (CORE-195): the dialog ticks it, the card counts it. */
describe("Done-when checklist", () => {
  const TEXT = "- [ ] Report delivered\n- [x] Legal assessment written\n\nNotes stay as they are";

  it("reads the task lines with their line numbers", () => {
    expect(checklistLines(TEXT)).toEqual([
      { line: 0, text: "Report delivered", done: false },
      { line: 1, text: "Legal assessment written", done: true },
    ]);
    expect(checklistLines(null)).toEqual([]);
  });

  it("counts done of total, and nothing when there is no task line", () => {
    expect(checklistProgress(TEXT)).toEqual({ done: 1, total: 2 });
    expect(checklistProgress("- [X] upper case counts\n* [ ] star bullets too")).toEqual({ done: 1, total: 2 });
    expect(checklistProgress("Just prose")).toBeNull();
    expect(checklistProgress(null)).toBeNull();
  });

  it("ticks and unticks one line, leaving the rest byte for byte", () => {
    const ticked = toggleChecklistLine(TEXT, 0);
    expect(ticked).toBe("- [x] Report delivered\n- [x] Legal assessment written\n\nNotes stay as they are");
    expect(toggleChecklistLine(ticked, 1)).toBe("- [x] Report delivered\n- [ ] Legal assessment written\n\nNotes stay as they are");
    expect(toggleChecklistLine(TEXT, 3)).toBe(TEXT);
  });

  it("turns plain lines and bullets into open tasks, keeping ticked ones and blank lines", () => {
    expect(asChecklist("Report delivered\n- Legal written\n- [x] Done already\n\n  ")).toBe(
      "- [ ] Report delivered\n- [ ] Legal written\n- [x] Done already",
    );
    expect(asChecklist("")).toBe("");
  });
});
