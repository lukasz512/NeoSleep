import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import en from "@i18n/en.json";
import WorkColumnCards from "./WorkColumnCards.vue";
import { WORK_BOARD_CONTEXT } from "./workBoardContext";
import { closesByItself, missingArtifact, reviewGroups } from "../../composables/useWorkBoard";
import type { WorkItem, WorkStatus } from "../../types/workBoard";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const DAY = 24 * 60 * 60_000;
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();
const ARTIFACT = { kind: "artifact", url: "https://claude.ai/artifact/x" } as const;

let seq = 0;
function item(key: string, overrides: Partial<WorkItem> = {}): WorkItem {
  const [team, number] = key.split("-") as [string, string];
  return {
    id: `item-${++seq}`, key, team_key: team, number: Number(number), title: `Title of ${key}`, problem: null, change: null, done_when: null,
    status: "needs_review", priority: 0, labels: [], links: [ARTIFACT], branch: null, assignee: null, due_date: null, source: "manual",
    created_at: daysAgo(30), updated_at: daysAgo(1), status_changed_at: daysAgo(1), completed_at: null,
    git_state: "none", git_sha: null, git_checked_at: daysAgo(0),
    ...overrides,
  };
}

function render(items: WorkItem[], status: WorkStatus = "needs_review") {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents });
  return mount(WorkColumnCards, {
    props: { status, items },
    global: {
      plugins: [i18n, vuetify],
      provide: { [WORK_BOARD_CONTEXT as symbol]: { colors: ref({}), dense: ref(false), now: ref(NOW) } },
    },
  });
}

const keys = (wrapper: ReturnType<typeof render>) =>
  wrapper.findAll("article").map((card) => card.attributes("data-testid")?.replace("work-card-", ""));

/** Needs Review shows what waits for a person apart from what closes by itself (CORE-233). */
describe("Needs Review groups (CORE-233)", () => {
  it("counts a ticket as closing by itself when it is merged and not on hold", () => {
    expect(closesByItself(item("CORE-1", { git_state: "dev" }))).toBe(true);
    expect(closesByItself(item("CORE-2", { git_state: "prod" }))).toBe(true);
    expect(closesByItself(item("CORE-3", { git_state: "none" }))).toBe(false);
    expect(closesByItself(item("CORE-4", { git_state: null }))).toBe(false);
    expect(closesByItself(item("CORE-5", { git_state: "prod", labels: ["hold"] }))).toBe(false);
  });

  it("puts the longest wait first in the waiting group and keeps the column's order in the merged one", () => {
    const groups = reviewGroups([
      item("CORE-1", { status_changed_at: daysAgo(2) }),
      item("CORE-2", { git_state: "dev" }),
      item("CORE-3", { status_changed_at: daysAgo(9) }),
      item("CORE-4", { git_state: "prod" }),
      item("CORE-5", { git_state: "prod", labels: ["hold"], status_changed_at: daysAgo(5) }),
    ]);
    expect(groups.waiting.map((i) => i.key)).toEqual(["CORE-3", "CORE-5", "CORE-1"]);
    expect(groups.merged.map((i) => i.key)).toEqual(["CORE-2", "CORE-4"]);
  });

  it("shows the waiting tickets with their count and folds the merged ones", () => {
    const wrapper = render([item("CORE-1"), item("CORE-2", { git_state: "dev" }), item("CORE-3", { git_state: "prod" })]);
    expect(wrapper.get("[data-testid='work-review-waiting']").text()).toBe("Waiting for you 1");
    const toggle = wrapper.get("[data-testid='work-review-merged-toggle']");
    expect(toggle.text()).toBe("Merged, closes by itself 2");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(keys(wrapper)).toEqual(["CORE-1"]);
  });

  it("unfolds and folds the merged tickets on click", async () => {
    const wrapper = render([item("CORE-1"), item("CORE-2", { git_state: "dev" })]);
    const toggle = wrapper.get("[data-testid='work-review-merged-toggle']");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(keys(wrapper)).toEqual(["CORE-1", "CORE-2"]);
    await toggle.trigger("click");
    expect(keys(wrapper)).toEqual(["CORE-1"]);
  });

  it("has no merged group when nothing is merged, and says 0 when nothing waits", () => {
    expect(render([item("CORE-1")]).find("[data-testid='work-review-merged-toggle']").exists()).toBe(false);
    expect(render([item("CORE-2", { git_state: "dev" })]).get("[data-testid='work-review-waiting']").text()).toBe("Waiting for you 0");
  });

  it("shows the days a ticket has waited on its card", () => {
    const wrapper = render([item("CORE-1", { status_changed_at: daysAgo(9) })]);
    expect(wrapper.get("[data-testid='work-card-days']").text()).toBe("9 d");
  });

  it("leaves every other status as one plain list", () => {
    const wrapper = render([item("CORE-1", { status: "building" }), item("CORE-2", { status: "building", git_state: "dev" })], "building");
    expect(wrapper.find("[data-testid='work-review-waiting']").exists()).toBe(false);
    expect(keys(wrapper)).toEqual(["CORE-1", "CORE-2"]);
  });

  it("passes a card's open on to the board", async () => {
    const wrapper = render([item("CORE-1")]);
    await wrapper.get("[data-testid='work-card-CORE-1'] button").trigger("click");
    expect(wrapper.emitted("open")).toEqual([["CORE-1"]]);
  });
});

describe("Missing artifact flag (CORE-233)", () => {
  it("flags only a Needs Review ticket with no artifact link", () => {
    expect(missingArtifact(item("CORE-1", { links: [] }))).toBe(true);
    expect(missingArtifact(item("CORE-2", { links: [{ kind: "pr", url: "https://github.com/x/y/pull/1" }] }))).toBe(true);
    expect(missingArtifact(item("CORE-3"))).toBe(false);
    expect(missingArtifact(item("CORE-4", { status: "building", links: [] }))).toBe(false);
  });

  it("shows on the card, merged or not", async () => {
    const wrapper = render([item("CORE-1", { links: [] }), item("CORE-2"), item("CORE-3", { git_state: "dev", links: [] })]);
    await wrapper.get("[data-testid='work-review-merged-toggle']").trigger("click");
    expect(wrapper.get("[data-testid='work-card-CORE-1'] [data-testid='work-card-no-artifact']").text()).toBe("No artifact");
    expect(wrapper.find("[data-testid='work-card-CORE-2'] [data-testid='work-card-no-artifact']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='work-card-CORE-3'] [data-testid='work-card-no-artifact']").exists()).toBe(true);
  });
});
