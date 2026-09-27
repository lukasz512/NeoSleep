import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AppSegmentProgress from "./AppSegmentProgress.vue";
import { checklistSegments, type ChecklistItem } from "../composables/usePatientChecklist";

describe("AppSegmentProgress", () => {
  it("renders one segment per item, each styled by its state", () => {
    const w = mount(AppSegmentProgress, { props: { segments: ["done", "waiting", "partial", "todo"], label: "1 of 4 done" } });
    const segs = w.findAll("[data-testid=app-segment-progress-segment]");
    expect(segs.map((s) => s.classes().find((c) => c.includes("--"))?.split("--")[1])).toEqual(["done", "waiting", "partial", "todo"]);
    expect(w.text()).toContain("1 of 4 done");
  });

  it("exposes done/total to screen readers as a progressbar", () => {
    const w = mount(AppSegmentProgress, { props: { segments: ["done", "done", "current"], ariaLabel: "Step 3 of 3" } });
    const bar = w.get("[role=progressbar]");
    expect(bar.attributes("aria-valuenow")).toBe("2");
    expect(bar.attributes("aria-valuemax")).toBe("3");
    expect(bar.attributes("aria-label")).toBe("Step 3 of 3");
    // No visible label row when only an aria label is given.
    expect(w.find(".app-segment-progress__label").exists()).toBe(false);
  });

  it("shows the meta text only when given", () => {
    const w = mount(AppSegmentProgress, { props: { segments: ["todo"], label: "0 of 1 done", meta: "1 waiting" } });
    expect(w.get(".app-segment-progress__meta").text()).toBe("1 waiting");
  });
});

describe("checklistSegments", () => {
  it("maps checklist statuses to segment states, keeping checklist order", () => {
    const items = (["done", "pending_patient", "partial", "missing"] as const).map((status) => ({ status }) as ChecklistItem);
    expect(checklistSegments(items)).toEqual(["done", "waiting", "partial", "todo"]);
  });
});
