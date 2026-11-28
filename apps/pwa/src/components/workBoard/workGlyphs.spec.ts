import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WorkStatusGlyph from "./WorkStatusGlyph.vue";
import WorkPriorityMark from "./WorkPriorityMark.vue";
import { WORK_STATUS_GLYPHS, WORK_STATUS_GROUPS } from "./workGlyphs";
import { WORK_STATUS_OPTIONS } from "../../composables/useWorkBoard";

/** Status and priority read at a glance (CORE-225). */
describe("work board glyphs", () => {
  it("gives every status its own shape or fill, so colour is never the only signal", () => {
    const signatures = WORK_STATUS_OPTIONS.map((status) => {
      const html = mount(WorkStatusGlyph, { props: { status } }).html();
      // The same drawing in another colour would still be the same signature.
      return html.replace(/#[0-9a-f]{3,6}/gi, "").replace(/data-status="[^"]+"/, "");
    });
    // Triage and Backlog share the dashed ring and Canceled shares nothing: 8 drawings for 9 statuses.
    expect(new Set(signatures).size).toBe(WORK_STATUS_OPTIONS.length - 1);
    expect(WORK_STATUS_GLYPHS.triage.tone).not.toBe(WORK_STATUS_GLYPHS.backlog.tone);
  });

  it("fills the pie further with every step from To spec to Needs review", () => {
    const fills = (["to_spec", "spec_ready", "approved", "building", "needs_review"] as const).map((s) => WORK_STATUS_GLYPHS[s].fill ?? 0);
    expect([...fills].sort((a, b) => a - b)).toEqual(fills);
    expect(new Set(fills).size).toBe(fills.length);
  });

  it("groups every status once, in the board's order", () => {
    expect(WORK_STATUS_GROUPS.flatMap((group) => group.statuses)).toEqual(WORK_STATUS_OPTIONS);
  });

  it("is decorative next to text and a named image when it stands alone", () => {
    const quiet = mount(WorkStatusGlyph, { props: { status: "done" } });
    expect(quiet.attributes("aria-hidden")).toBe("true");
    expect(quiet.attributes("role")).toBeUndefined();
    const named = mount(WorkPriorityMark, { props: { priority: 1, label: "Urgent" } });
    expect(named.attributes("role")).toBe("img");
    expect(named.attributes("aria-label")).toBe("Urgent");
    expect(named.attributes("aria-hidden")).toBeUndefined();
  });

  it("lights 3, 2 and 1 bars for high, medium and low; urgent and none draw no bars", () => {
    const lit = (priority: number) => mount(WorkPriorityMark, { props: { priority } }).findAll('[data-lit="true"]').length;
    expect([2, 3, 4].map(lit)).toEqual([3, 2, 1]);
    expect(mount(WorkPriorityMark, { props: { priority: 1 } }).findAll("[data-lit]")).toHaveLength(0);
    expect(mount(WorkPriorityMark, { props: { priority: 0 } }).find("[data-none]").exists()).toBe(true);
  });
});
