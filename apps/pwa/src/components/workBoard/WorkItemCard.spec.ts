import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import en from "@i18n/en.json";
import WorkItemCard from "./WorkItemCard.vue";
import { WORK_BOARD_CONTEXT } from "./workBoardContext";
import type { WorkItem } from "../../types/workBoard";

function item(done_when: string | null): WorkItem {
  return {
    id: "item-1", key: "CORE-9", team_key: "CORE", number: 9, title: "Paste does not work", problem: null, change: null, done_when,
    status: "building", priority: 0, labels: [], links: [], branch: null, assignee: null, due_date: null, source: "manual",
    created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-10T10:00:00Z", status_changed_at: "2026-11-10T10:00:00Z", completed_at: null,
    git_state: null, git_sha: null, git_checked_at: null,
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

/** Labels, session badge, footer and density on a card (CORE-219). */
describe("WorkItemCard labels, session and footer (CORE-219)", () => {
  const NOW = Date.parse("2026-11-16T12:00:00Z");
  const DAY = 24 * 60;
  const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

  function card(overrides: Partial<WorkItem>, dense = false) {
    const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
    const vuetify = createVuetify({ components: vuetifyComponents });
    return mount(WorkItemCard, {
      props: { item: { ...item(null), status_changed_at: ago(10), ...overrides } },
      global: {
        plugins: [i18n, vuetify],
        provide: { [WORK_BOARD_CONTEXT as symbol]: { colors: ref({ api: "red" }), dense: ref(dense), now: ref(NOW) } },
      },
    });
  }
  const has = (wrapper: ReturnType<typeof card>, id: string) => wrapper.find(`[data-testid='${id}']`).exists();

  it("shows up to three labels in the catalog's colour, then +n, and never the session label", () => {
    const wrapper = card({ labels: ["session", "api", "billing", "frontend", "infra", "ux"] });
    const chips = wrapper.findAll("[data-testid^='work-card-label-']").map((c) => c.text());
    expect(chips).toEqual(["api", "billing", "frontend"]);
    expect(wrapper.get("[data-testid='work-card-labels-more']").text()).toBe("+2");
    expect(wrapper.get("[data-testid='work-card-label-api']").classes()).toContain("work-label--red");
  });

  it("asks the board to filter when a label is clicked", async () => {
    const wrapper = card({ labels: ["api"] });
    await wrapper.get("[data-testid='work-card-label-api']").trigger("click");
    expect(wrapper.emitted("label")).toEqual([["api"]]);
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("marks a session ticket with a robot and a live dot only within 15 minutes of a session's touch", () => {
    expect(has(card({}), "work-card-session")).toBe(false);
    const quiet = card({ labels: ["session"], session_active_at: ago(16) });
    expect(has(quiet, "work-card-session")).toBe(true);
    expect(has(quiet, "work-card-live")).toBe(false);
    const live = card({ session_active_at: ago(14) });
    expect(has(live, "work-card-session")).toBe(true);
    expect(has(live, "work-card-live")).toBe(true);
  });

  it("shows the assignee's initials, the due date and the days in the column", () => {
    const wrapper = card({ assignee: "lukasz.ostrowski@neosleepcare.com", due_date: "2026-11-20", status_changed_at: ago(2 * DAY + 5) });
    expect(wrapper.get("[data-testid='work-card-assignee']").text()).toBe("LO");
    expect(wrapper.get("[data-testid='work-card-due']").classes()).not.toContain("work-card__due--overdue");
    expect(wrapper.get("[data-testid='work-card-days']").text()).toBe("2 d");
    expect(wrapper.get("[data-testid='work-card-days']").classes()).not.toContain("work-card__days--stale");
  });

  it("has no footer on a fresh card nobody owns", () => {
    expect(has(card({}), "work-card-footer")).toBe(false);
  });

  it("flags an overdue date and a card that waits too long, but not a closed one", () => {
    const days = (wrapper: ReturnType<typeof card>) => wrapper.get("[data-testid='work-card-days']").classes();
    const late = card({ due_date: "2026-11-10", status: "needs_review", status_changed_at: ago(4 * DAY) });
    expect(late.get("[data-testid='work-card-due']").classes()).toContain("work-card__due--overdue");
    expect(days(late)).toContain("work-card__days--stale");
    expect(days(card({ status: "building", status_changed_at: ago(7 * DAY) }))).not.toContain("work-card__days--stale");
    expect(days(card({ status: "building", status_changed_at: ago(8 * DAY) }))).toContain("work-card__days--stale");
    const done = card({ due_date: "2026-11-10", status: "done", status_changed_at: ago(30 * DAY) });
    expect(done.get("[data-testid='work-card-due']").classes()).not.toContain("work-card__due--overdue");
    expect(has(done, "work-card-days")).toBe(false);
  });

  it("names every link and shows the CI state", () => {
    const ci = (state?: "passed" | "failed") =>
      card({ links: [{ kind: "ci", url: "https://ci.test/1", ...(state ? { state } : {}) }] }).get("[data-testid='work-card-link-ci']");
    expect(ci().attributes("aria-label")).toBe("CI");
    expect(ci().classes()).not.toContain("work-card__link--passed");
    expect(ci("passed").attributes("aria-label")).toBe("CI passed");
    expect(ci("passed").classes()).toContain("work-card__link--passed");
    expect(ci("failed").attributes("aria-label")).toBe("CI failed");
    expect(ci("failed").classes()).toContain("work-card__link--failed");
  });

  it("keeps only the top rows and the links when compact", () => {
    const wrapper = card({ labels: ["api"], assignee: "a@b.c", links: [{ kind: "pr", url: "https://x.test/1" }] }, true);
    expect(wrapper.classes()).toContain("work-card--dense");
    expect(has(wrapper, "work-card-labels")).toBe(false);
    expect(has(wrapper, "work-card-footer")).toBe(false);
    expect(has(wrapper, "work-card-link-pr")).toBe(true);
  });
});
