import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import en from "@i18n/en.json";
import WorkItemCard from "./WorkItemCard.vue";
import type { WorkItem } from "../../types/workBoard";

function item(done_when: string | null): WorkItem {
  return {
    id: "item-1", key: "CORE-9", team_key: "CORE", number: 9, title: "Paste does not work", problem: null, change: null, done_when,
    status: "building", priority: 0, labels: [], links: [], branch: null, assignee: null, due_date: null, source: "manual",
    created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-10T10:00:00Z", status_changed_at: "2026-11-10T10:00:00Z", completed_at: null,
  };
}

function render(done_when: string | null) {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents });
  return mount(WorkItemCard, { props: { item: item(done_when) }, global: { plugins: [i18n, vuetify] } });
}

/** The card shows how much of "Done when" is ticked (CORE-195). */
describe("WorkItemCard done-when counter", () => {
  it("shows done of total", () => {
    const progress = render("- [x] One\n- [ ] Two").find("[data-testid='work-card-progress']");
    expect(progress.text()).toBe("1/2");
    expect(progress.attributes("aria-label")).toBe("Done when: 1 of 2");
    expect(progress.classes()).not.toContain("work-card__progress--complete");
  });

  it("marks a fully ticked list as complete", () => {
    expect(render("- [x] One").find("[data-testid='work-card-progress']").classes()).toContain("work-card__progress--complete");
  });

  it("shows nothing without task lines", () => {
    expect(render("Plain prose").find("[data-testid='work-card-progress']").exists()).toBe(false);
    expect(render(null).find("[data-testid='work-card-progress']").exists()).toBe(false);
  });
});
