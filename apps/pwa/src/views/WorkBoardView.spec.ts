import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import en from "@i18n/en.json";
import WorkBoardView from "./WorkBoardView.vue";
import {
  WORK_BOARD_COLUMNS,
  daysInColumn,
  gitMarker,
  groupByLabel,
  groupByStatus,
  initialsOf,
  isLive,
  isOverdue,
  isStale,
  matchesLabels,
  matchesQuery,
  neighbourStatus,
  outOfStep,
} from "../composables/useWorkBoard";
import type { WorkItem, WorkLabel, WorkSessionToken, WorkTeam } from "../types/workBoard";

/** Platform work board (CORE-177): columns, phone list, team filter, moves and shortcuts. */
const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  backgroundApiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const TEAMS: WorkTeam[] = [
  { key: "CORE", name: "NeoCRM Core", kind: "platform" },
  { key: "NEO", name: "NeoSleep", kind: "client" },
];

function item(overrides: Partial<WorkItem>): WorkItem {
  const key = overrides.key ?? "CORE-1";
  return {
    id: `id-${key}`,
    key,
    team_key: key.split("-")[0]!,
    number: Number(key.split("-")[1]),
    title: `Title of ${key}`,
    problem: null,
    change: null,
    done_when: null,
    status: "backlog",
    priority: 0,
    labels: [],
    links: [],
    branch: null,
    assignee: null,
    due_date: null,
    source: "manual",
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    status_changed_at: "2026-10-01T10:00:00Z",
    completed_at: null,
    git_state: null,
    git_sha: null,
    git_checked_at: null,
    ...overrides,
  };
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function label(name: string, color: WorkLabel["color"] = "blue"): WorkLabel {
  return { id: `l-${name.toLowerCase()}`, name, color, created_at: "2026-11-10T10:00:00Z" };
}

function token(id: string, overrides: Partial<WorkSessionToken> = {}): WorkSessionToken {
  return { id, name: `Device ${id}`, created_by: "me", created_at: "2026-10-07T10:00:00Z", last_used_at: null, revoked_at: null, ...overrides };
}

function refused(status: number, error: string): Response {
  return { ok: false, status, json: async () => ({ error }), headers: new Headers() } as Response;
}

interface Extra {
  labels?: WorkLabel[];
  tokens?: WorkSessionToken[];
  /** Label names the catalog refuses on rename (taken or reserved). */
  refusedNames?: string[];
}

function serve(items: WorkItem[], teams: WorkTeam[] | "forbidden" = TEAMS, extra: Extra = {}): void {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/platform/work/teams")) {
      if (teams === "forbidden") return refused(403, "Platform admin only");
      return ok({ items: teams });
    }
    if (path.endsWith("/platform/work/items")) return ok({ items });
    if (path.endsWith("/platform/work/labels")) return ok({ items: extra.labels ?? [] });
    if (path.includes("/platform/work/labels/")) {
      const patch = JSON.parse(String(init!.body)) as Partial<WorkLabel>;
      if (patch.name && extra.refusedNames?.includes(patch.name)) return refused(400, "Label name is taken");
      return ok({ item: { ...(extra.labels ?? []).find((l) => l.id === path.split("/").pop())!, ...patch } });
    }
    if (path.endsWith("/session-tokens")) return ok({ items: extra.tokens ?? [] });
    if (init?.method === "PATCH") {
      const key = decodeURIComponent(path.split("/").pop()!);
      const patch = JSON.parse(String(init.body)) as Partial<WorkItem>;
      return ok({ item: { ...items.find((i) => i.key === key)!, ...patch } });
    }
    if (path.endsWith("/platform/work/people")) return ok({ items: [] });
    return ok({ item: items[0], events: [], attachments: [] });
  });
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  localStorage.clear();
  vi.useRealTimers();
});

async function render(width = 1280, search = ""): Promise<{ wrapper: VueWrapper; router: Router }> {
  window.innerWidth = width;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/platform/board", component: WorkBoardView }] });
  await router.push(`/platform/board${search}`);
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(WorkBoardView, { global: { plugins: [i18n, vuetify, router] }, attachTo: document.body });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

/** Menus and the phone sheet render under the document body, outside the view. */
const inDoc = (id: string) => document.querySelector<HTMLElement>(`[data-testid='${id}']`);
async function press(id: string): Promise<void> {
  inDoc(id)!.click();
  await flushPromises();
}
async function openView(wrapper: VueWrapper): Promise<void> {
  await wrapper.get("[data-testid='work-board-view']").trigger("click");
  await flushPromises();
}
async function openFilters(wrapper: VueWrapper): Promise<void> {
  await wrapper.get("[data-testid='work-board-filters-open']").trigger("click");
  await flushPromises();
}

describe("WorkBoardView", () => {
  it("shows the eight columns in flow order with each item in its column", async () => {
    serve([item({ key: "CORE-1", status: "to_spec" }), item({ key: "NEO-7", status: "needs_review" })]);
    const { wrapper } = await render();
    const columns = wrapper.findAll("[data-testid^='work-column-']").map((c) => c.attributes("data-testid"));
    expect(columns).toEqual(WORK_BOARD_COLUMNS.map((s) => `work-column-${s}`));
    expect(wrapper.get("[data-testid='work-column-to_spec']").text()).toContain("CORE-1");
    expect(wrapper.get("[data-testid='work-column-needs_review']").text()).toContain("NEO-7");
  });

  it("shows a status-grouped list instead of columns at phone width", async () => {
    serve([item({ key: "CORE-1" })]);
    const { wrapper } = await render(375);
    expect(wrapper.find("[data-testid='work-board-columns']").exists()).toBe(false);
    expect(wrapper.get("[data-testid='work-board-list']").text()).toContain("CORE-1");
  });

  it("filters by team", async () => {
    serve([item({ key: "CORE-1" }), item({ key: "NEO-2" })]);
    const { wrapper } = await render();
    const neo = wrapper.get("[data-testid='work-board-teams']").findAll("button").find((b) => b.text() === "NEO")!;
    await neo.trigger("click");
    expect(wrapper.find("[data-testid='work-card-CORE-1']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='work-card-NEO-2']").exists()).toBe(true);
  });

  it("shows only Claude-session tickets with the Session filter (CORE-187)", async () => {
    serve([item({ key: "CORE-1" }), item({ key: "CORE-2", status: "building", labels: ["session"] })]);
    const { wrapper } = await render();
    await wrapper.get("[data-testid='work-board-session-filter']").trigger("click");
    expect(wrapper.find("[data-testid='work-card-CORE-1']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='work-card-CORE-2']").exists()).toBe(true);
  });

  it("issues a session token and shows the plaintext once (CORE-187)", async () => {
    serve([]);
    const base = apiFetch.getMockImplementation()!;
    const tokens: Array<{ id: string; name: string; created_by: string; created_at: string; last_used_at: null; revoked_at: null }> = [];
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (!path.includes("/session-tokens")) return base(path, init);
      if (init?.method === "POST") {
        const row = { id: "t1", name: "Laptop", created_by: "me", created_at: "2026-10-07T10:00:00Z", last_used_at: null, revoked_at: null };
        tokens.push(row);
        return { ok: true, status: 201, json: async () => ({ item: row, token: "nbs_secret-plaintext" }) } as Response;
      }
      return ok({ items: tokens });
    });
    const { wrapper } = await render();
    await openView(wrapper);
    await press("work-board-tokens");
    const dialog = () => document.querySelector("[data-testid='work-tokens-dialog']")!;
    const name = dialog().querySelector("[data-testid='work-token-name'] input") as HTMLInputElement;
    name.value = "Laptop";
    name.dispatchEvent(new Event("input"));
    await flushPromises();
    (dialog().querySelector("[data-testid='work-token-create']") as HTMLButtonElement).click();
    await flushPromises();
    expect(dialog().querySelector("[data-testid='work-token-plaintext']")?.textContent).toContain("nbs_secret-plaintext");
    expect(dialog().textContent).toContain("Laptop");
  });

  it("folds revoked tokens away until asked (CORE-196 D2)", async () => {
    serve([]);
    const base = apiFetch.getMockImplementation()!;
    const row = (id: string, name: string, revoked_at: string | null) => ({
      id, name, created_by: "me", created_at: "2026-10-07T10:00:00Z", last_used_at: null, revoked_at,
    });
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) =>
      path.includes("/session-tokens") ? ok({ items: [row("t1", "Laptop", null), row("t2", "Old Mac", "2026-10-08T10:00:00Z")] }) : base(path, init),
    );
    const { wrapper } = await render();
    await openView(wrapper);
    await press("work-board-tokens");
    const dialog = () => document.querySelector("[data-testid='work-tokens-dialog']")!;
    expect(dialog().querySelector("[data-testid='work-tokens-active']")?.textContent).toContain("Laptop");
    expect(dialog().querySelector("[data-testid='work-token-revoke-t1']")).not.toBeNull();
    expect(dialog().textContent).not.toContain("Old Mac");
    (dialog().querySelector("[data-testid='work-tokens-revoked-toggle']") as HTMLButtonElement).click();
    await flushPromises();
    expect(dialog().querySelector("[data-testid='work-tokens-revoked']")?.textContent).toContain("Old Mac");
    expect(dialog().querySelector("[data-testid='work-token-revoke-t2']")).toBeNull();
  });

  it("shows a card's spec, PR and CI links", async () => {
    serve([
      item({
        key: "CORE-3",
        links: [
          { kind: "pr", url: "https://github.com/x/pull/1" },
          { kind: "spec", url: "https://claude.ai/artifact/s" },
          { kind: "ci", url: "https://github.com/x/actions/runs/1" },
        ],
      }),
    ]);
    const { wrapper } = await render();
    const kinds = wrapper.get("[data-testid='work-card-CORE-3']").findAll("a").map((a) => a.attributes("data-testid"));
    expect(kinds).toEqual(["work-card-link-spec", "work-card-link-pr", "work-card-link-ci"]);
  });

  it("moves the focused card one column right with ]", async () => {
    serve([item({ key: "CORE-4", status: "backlog" })]);
    const { wrapper } = await render();
    await wrapper.get("[data-testid='work-card-CORE-4'] button").trigger("keydown", { key: "]" });
    await flushPromises();
    const patch = apiFetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")!;
    expect(patch[0]).toBe("/api/v1/platform/work/items/CORE-4");
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ status: "to_spec" });
    expect(wrapper.get("[data-testid='work-column-to_spec']").text()).toContain("CORE-4");
  });

  it("n opens a new item, / focuses search, Esc-closed card clears ?item", async () => {
    serve([item({ key: "CORE-5" })]);
    const { wrapper, router } = await render();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));
    expect(document.activeElement?.closest("[data-testid='work-board-search']")).not.toBeNull();
    (document.activeElement as HTMLElement).blur();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
    await flushPromises();
    expect(document.querySelector("[data-testid='work-item-dialog']")).not.toBeNull();

    await router.replace({ query: { item: "CORE-5" } });
    await wrapper.get("[data-testid='work-card-CORE-5'] button").trigger("click");
    expect(router.currentRoute.value.query.item).toBe("CORE-5");
  });

  it("caps Done at 20 cards until asked for more", async () => {
    serve(Array.from({ length: 23 }, (_, i) => item({ key: `CORE-${i + 1}`, status: "done" })));
    const { wrapper } = await render();
    const done = () => wrapper.get("[data-testid='work-column-done']").findAll("[data-testid^='work-card-CORE']").length;
    expect(done()).toBe(20);
    await wrapper.get("[data-testid='work-board-more']").trigger("click");
    expect(done()).toBe(23);
  });

  it("folds a status with no tickets into a strip that still takes a drop (CORE-221)", async () => {
    serve([item({ key: "CORE-1", status: "building" })]);
    const { wrapper } = await render();
    const column = (status: string) => wrapper.get(`[data-testid='work-column-${status}']`);
    expect(column("building").classes()).not.toContain("work-columns__column--empty");
    expect(column("to_spec").classes()).toContain("work-columns__column--empty");
    expect(column("to_spec").text()).toContain("To spec");
    await column("to_spec").trigger("drop", { dataTransfer: { getData: () => "CORE-1" } });
    await flushPromises();
    expect(column("to_spec").text()).toContain("CORE-1");
    expect(column("to_spec").classes()).not.toContain("work-columns__column--empty");
    expect(column("building").classes()).toContain("work-columns__column--empty");
  });

  it("leaves empty statuses out of the phone list (CORE-221)", async () => {
    serve([item({ key: "CORE-1", status: "building" })]);
    const { wrapper } = await render(375);
    expect(wrapper.findAll("[role='tab']").map((tab) => tab.text())).toEqual(["Building 1"]);
  });

  it("draws each status next to its heading, in the columns and on the phone tabs (CORE-225)", async () => {
    serve([item({ key: "CORE-1", status: "building" })]);
    const desktop = (await render()).wrapper;
    for (const status of WORK_BOARD_COLUMNS) {
      expect(desktop.get(`[data-testid='work-column-${status}'] h2 svg`).attributes("data-status")).toBe(status);
    }
    const glyph = (await render(375)).wrapper.get("[data-testid='work-tab-building'] svg");
    expect(glyph.attributes("data-status")).toBe("building");
    expect(glyph.attributes("aria-hidden")).toBe("true");
  });

  it("keeps canceled tickets hidden until asked (CORE-221)", async () => {
    serve([item({ key: "CORE-1" }), item({ key: "CORE-2", status: "canceled" })]);
    const { wrapper } = await render();
    expect(wrapper.find("[data-testid='work-column-canceled']").exists()).toBe(false);
    await openView(wrapper);
    expect(inDoc("work-board-canceled")!.textContent!.trim()).toBe("Show canceled (1)");
    await press("work-board-canceled");
    expect(wrapper.get("[data-testid='work-column-canceled']").text()).toContain("CORE-2");
  });

  it("offers no canceled toggle when nothing is canceled (CORE-221)", async () => {
    serve([item({ key: "CORE-1" })]);
    const { wrapper } = await render();
    await openView(wrapper);
    expect(inDoc("work-board-density")).not.toBeNull();
    expect(inDoc("work-board-canceled")).toBeNull();
  });

  it("marks where the code is on open cards and never on Done (CORE-221)", async () => {
    serve([
      item({ key: "CORE-1", status: "building", git_state: "none" }),
      item({ key: "CORE-2", status: "needs_review", git_state: "dev" }),
      item({ key: "CORE-3", status: "done", git_state: "prod" }),
      item({ key: "CORE-4", status: "backlog", git_state: "none" }),
      item({ key: "CORE-5", status: "building", git_state: null }),
      item({ key: "CORE-6", status: "needs_review", git_state: "prod", labels: ["hold"] }),
    ]);
    const { wrapper } = await render();
    // Merged Needs Review tickets sit in a folded group (CORE-233).
    await wrapper.get("[data-testid='work-review-merged-toggle']").trigger("click");
    const marker = (key: string) => wrapper.get(`[data-testid='work-card-${key}']`).find("[data-testid='work-card-git']");
    expect(marker("CORE-1").text()).toBe("Not merged");
    expect(marker("CORE-2").text()).toBe("On dev");
    expect(marker("CORE-3").exists()).toBe(false);
    expect(marker("CORE-4").exists()).toBe(false);
    expect(marker("CORE-5").exists()).toBe(false);
    expect(marker("CORE-6").text()).toBe("On prod");
    expect(wrapper.get("[data-testid='work-card-CORE-6']").get("[data-testid='work-card-hold']").text()).toBe("On hold");
    expect(wrapper.get("[data-testid='work-card-CORE-2']").find("[data-testid='work-card-hold']").exists()).toBe(false);
  });

  it("filters to the tickets whose status and git disagree (CORE-221)", async () => {
    serve([
      item({ key: "CORE-1", status: "needs_review", git_state: "none" }),
      item({ key: "CORE-2", status: "needs_review", git_state: "dev" }),
      item({ key: "CORE-3", status: "needs_review", git_state: "prod" }),
      item({ key: "CORE-4", status: "needs_review", git_state: "prod", labels: ["hold"] }),
      item({ key: "CORE-5", status: "building", git_state: "none" }),
    ]);
    const { wrapper } = await render();
    await wrapper.get("[data-testid='work-review-merged-toggle']").trigger("click");
    await openView(wrapper);
    expect(inDoc("work-board-out-of-step")!.textContent!.trim()).toBe("Out of step · 2");
    expect(wrapper.get("[data-testid='work-card-CORE-1'] [data-testid='work-card-git']").classes()).toContain("work-card__git--alert");
    expect(wrapper.get("[data-testid='work-card-CORE-2'] [data-testid='work-card-git']").classes()).not.toContain("work-card__git--alert");
    await press("work-board-out-of-step");
    const cards = wrapper.findAll("[data-testid^='work-card-CORE']").map((c) => c.attributes("data-testid"));
    expect(cards).toEqual(["work-card-CORE-1", "work-card-CORE-3"]);
  });

  it("tells a tenant admin the board is for the platform team", async () => {
    serve([], "forbidden");
    const { wrapper } = await render();
    expect(wrapper.text()).toContain("Platform team only");
    expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/items"))).toBe(false);
  });
});

/** Labels, lanes, session and token indicators (CORE-219). */
describe("WorkBoardView labels and lanes (CORE-219)", () => {
  const CATALOG = [label("api"), label("Billing", "green"), label("ux", "pink"), label("zeta", "amber")];
  const has = (wrapper: VueWrapper, id: string) => wrapper.find(`[data-testid='${id}']`).exists();
  const pressed = (wrapper: VueWrapper, id: string) => wrapper.get(`[data-testid='${id}']`).attributes("aria-pressed");
  const laneIds = (wrapper: VueWrapper) => wrapper.findAll(".work-board__lane").map((lane) => lane.attributes("data-testid"));

  function board(): WorkItem[] {
    return [
      item({ key: "CORE-1", labels: ["ux", "api"] }),
      item({ key: "CORE-2", labels: ["Billing"], status: "building" }),
      item({ key: "CORE-3" }),
      item({ key: "CORE-4", labels: ["session"] }),
      item({ key: "NEO-5", labels: ["session", "api"] }),
    ];
  }

  it("filters by every selected label at once and counts the session tickets", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper } = await render();
    expect(wrapper.get("[data-testid='work-board-session-count']").text()).toBe("2");
    await openFilters(wrapper);
    await press("work-filter-option-api");
    expect(inDoc("work-filter-option-api")!.getAttribute("aria-pressed")).toBe("true");
    expect(pressed(wrapper, "work-filter-label-api")).toBe("true");
    expect(has(wrapper, "work-card-CORE-1")).toBe(true);
    expect(has(wrapper, "work-card-NEO-5")).toBe(true);
    expect(has(wrapper, "work-card-CORE-2")).toBe(false);
    await press("work-filter-option-ux");
    expect(has(wrapper, "work-card-CORE-1")).toBe(true);
    expect(has(wrapper, "work-card-NEO-5")).toBe(false);
    await wrapper.get("[data-testid='work-filter-label-api']").trigger("click");
    await wrapper.get("[data-testid='work-filter-label-ux']").trigger("click");
    expect(has(wrapper, "work-card-CORE-3")).toBe(true);
  });

  it("filters by a label clicked on a card and writes it to the URL", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper, router } = await render();
    await wrapper.get("[data-testid='work-card-CORE-2'] [data-testid='work-card-label-Billing']").trigger("click");
    await flushPromises();
    expect(pressed(wrapper, "work-filter-label-Billing")).toBe("true");
    expect(has(wrapper, "work-card-CORE-1")).toBe(false);
    expect(router.currentRoute.value.fullPath).toContain("labels=Billing");
    expect(router.currentRoute.value.query.item).toBeUndefined();
  });

  it("restores team, labels, sessions and sort from the URL", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper } = await render(1280, "?team=NEO&labels=api&sessions=1&sort=label");
    expect(pressed(wrapper, "work-board-session-filter")).toBe("true");
    expect(pressed(wrapper, "work-filter-label-api")).toBe("true");
    await openView(wrapper);
    expect(inDoc("work-board-sort-label")!.getAttribute("aria-selected")).toBe("true");
    expect(laneIds(wrapper)).toEqual(["work-lane-api"]);
    expect(wrapper.findAll("[data-testid^='work-card-']").filter((c) => c.element.tagName === "ARTICLE").map((c) => c.attributes("data-testid"))).toEqual(["work-card-NEO-5"]);
  });

  it("falls back to all teams for a team the URL names but the board does not have", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper } = await render(1280, "?team=GONE");
    expect(has(wrapper, "work-card-CORE-1")).toBe(true);
    expect(has(wrapper, "work-card-NEO-5")).toBe(true);
  });

  it("sorts by label into lanes: by name, first label wins, no lane for an unused label, No label last", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper } = await render();
    expect(has(wrapper, "work-board-lanes")).toBe(false);
    await openView(wrapper);
    await press("work-board-sort-label");
    expect(laneIds(wrapper)).toEqual(["work-lane-api", "work-lane-Billing", "work-lane-none"]);
    const api = wrapper.get("[data-testid='work-lane-api']");
    expect(api.find("[data-testid='work-card-CORE-1']").exists()).toBe(true);
    expect(api.find("[data-testid='work-card-NEO-5']").exists()).toBe(true);
    expect(api.findAll("[data-testid^='work-column-']")).toHaveLength(WORK_BOARD_COLUMNS.length);
    const none = wrapper.get("[data-testid='work-lane-none']");
    expect(none.text()).toContain("No label");
    expect(none.find("[data-testid='work-card-CORE-3']").exists()).toBe(true);
    expect(none.find("[data-testid='work-card-CORE-4']").exists()).toBe(true);
  });

  it("changes only the status when a card is dropped inside a lane", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper } = await render(1280, "?sort=label");
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { getData: () => "CORE-1" } });
    wrapper.get("[data-testid='work-lane-api'] [data-testid='work-column-building']").element.dispatchEvent(drop);
    await flushPromises();
    const patch = apiFetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")!;
    expect(patch[0]).toBe("/api/v1/platform/work/items/CORE-1");
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ status: "building" });
    const moved = wrapper.get("[data-testid='work-lane-api'] [data-testid='work-column-building'] [data-testid='work-card-CORE-1']");
    expect(moved.find("[data-testid='work-card-label-ux']").exists()).toBe(true);
  });

  it("groups the phone list by label, then status, with the lanes folded until opened", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper } = await render(375, "?sort=label");
    expect(has(wrapper, "work-board-columns")).toBe(false);
    expect(laneIds(wrapper)).toEqual(["work-lane-api", "work-lane-Billing", "work-lane-none"]);
    expect(has(wrapper, "work-board-list")).toBe(false);
    await wrapper.get("[data-testid='work-lane-toggle-Billing']").trigger("click");
    const billing = wrapper.get("[data-testid='work-lane-Billing'] [data-testid='work-board-list']");
    expect(billing.text()).toContain("CORE-2");
    expect(billing.text()).toContain("Building");
    expect(billing.text()).not.toContain("Backlog");
  });

  it("remembers a folded lane and the compact cards in this browser", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const first = await render(1280, "?sort=label");
    await first.wrapper.get("[data-testid='work-lane-toggle-api']").trigger("click");
    await openView(first.wrapper);
    await press("work-board-density");
    expect(first.wrapper.get("[data-testid='work-lane-api']").find("[data-testid='work-board-columns']").exists()).toBe(false);
    expect(first.wrapper.get("[data-testid='work-card-CORE-2']").classes()).toContain("work-card--dense");
    first.wrapper.unmount();
    wrappers.length = 0;

    const { wrapper } = await render(1280, "?sort=label");
    expect(wrapper.get("[data-testid='work-lane-toggle-api']").attributes("aria-expanded")).toBe("false");
    expect(has(wrapper, "work-card-CORE-1")).toBe(false);
    await openView(wrapper);
    expect(inDoc("work-board-density")!.getAttribute("aria-pressed")).toBe("true");
    expect(wrapper.get("[data-testid='work-card-CORE-2']").classes()).toContain("work-card--dense");
  });

  it("shows how many session tokens work on the key button", async () => {
    serve([], TEAMS, { tokens: [token("t1"), token("t2"), token("t3", { revoked_at: "2026-10-08T10:00:00Z" })] });
    const { wrapper } = await render();
    await openView(wrapper);
    expect(inDoc("work-board-token-count")!.textContent).toBe("2");
    expect(inDoc("work-board-tokens")!.getAttribute("aria-label")).toBe("Session tokens · 2 active");
  });

  it("marks a token a session used in the last 15 minutes", async () => {
    const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
    serve([], TEAMS, { tokens: [token("t1", { last_used_at: minutesAgo(5) }), token("t2", { last_used_at: minutesAgo(50) })] });
    const { wrapper } = await render();
    await openView(wrapper);
    await press("work-board-tokens");
    expect(document.querySelector("[data-testid='work-token-live-t1']")).not.toBeNull();
    expect(document.querySelector("[data-testid='work-token-live-t2']")).toBeNull();
  });

  it("refreshes every minute so a session's live dot appears and fades", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
    serve([item({ key: "CORE-1" })]);
    const { wrapper } = await render();
    expect(has(wrapper, "work-card-live")).toBe(false);

    serve([item({ key: "CORE-1", session_active_at: "2026-11-16T12:00:30Z" })]);
    vi.advanceTimersByTime(60_000);
    await flushPromises();
    expect(has(wrapper, "work-card-live")).toBe(true);

    vi.advanceTimersByTime(16 * 60_000);
    await flushPromises();
    expect(has(wrapper, "work-card-live")).toBe(false);
    expect(has(wrapper, "work-card-session")).toBe(false);
  });

  it("renames a label everywhere on the board", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper } = await render(1280, "?labels=api");
    await openView(wrapper);
    await press("work-board-edit-labels");
    const name = document.querySelector("[data-testid='work-label-name-l-api'] input") as HTMLInputElement;
    name.value = "backend";
    name.dispatchEvent(new Event("input"));
    await flushPromises();
    (document.querySelector("[data-testid='work-label-save-l-api']") as HTMLButtonElement).click();
    await flushPromises();
    const patch = apiFetch.mock.calls.find(([path]) => String(path).endsWith("/labels/l-api"))!;
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ name: "backend" });
    expect(has(wrapper, "work-filter-label-api")).toBe(false);
    expect(pressed(wrapper, "work-filter-label-backend")).toBe("true");
    expect(wrapper.get("[data-testid='work-card-CORE-1']").find("[data-testid='work-card-label-backend']").exists()).toBe(true);
  });

  it("says so when the new name is taken, and changes nothing", async () => {
    serve(board(), TEAMS, { labels: CATALOG, refusedNames: ["Billing"] });
    const { wrapper } = await render();
    await openView(wrapper);
    await press("work-board-edit-labels");
    const name = document.querySelector("[data-testid='work-label-name-l-api'] input") as HTMLInputElement;
    name.value = "Billing";
    name.dispatchEvent(new Event("input"));
    await flushPromises();
    (document.querySelector("[data-testid='work-label-save-l-api']") as HTMLButtonElement).click();
    await flushPromises();
    expect(document.querySelector("[data-testid='work-label-row-l-api']")!.textContent).toContain("This name is taken or not allowed");
    expect(wrapper.get("[data-testid='work-card-CORE-1']").find("[data-testid='work-card-label-api']").exists()).toBe(true);
  });

  it("keeps the top to one row and counts what the View menu has switched on (r2 D1)", async () => {
    serve([item({ key: "CORE-1", status: "needs_review", git_state: "none" }), item({ key: "CORE-2", status: "canceled" })], TEAMS, { labels: CATALOG });
    const { wrapper } = await render();
    const view = wrapper.get("[data-testid='work-board-view']");
    expect(view.text()).toBe("View");
    for (const id of ["work-board-out-of-step", "work-board-canceled", "work-board-sort", "work-board-density", "work-board-edit-labels", "work-board-tokens"]) {
      expect(has(wrapper, id)).toBe(false);
    }
    await openView(wrapper);
    expect(inDoc("work-board-view-menu")!.textContent).toContain("move the focused card");
    await press("work-board-canceled");
    await press("work-board-out-of-step");
    expect(view.text()).toBe("View · 2");
    await press("work-board-sort-label");
    await press("work-board-density");
    expect(view.text()).toBe("View · 3");
  });

  it("lists no label until it is picked; picked ones are chips that come off one by one or all at once (r2 D2)", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper, router } = await render();
    expect(wrapper.findAll("[data-testid^='work-filter-label-']")).toHaveLength(0);
    expect(has(wrapper, "work-board-clear-filters")).toBe(false);
    expect(wrapper.get("[data-testid='work-board-session-count']").text()).toBe("2");
    await openFilters(wrapper);
    expect(["api", "Billing", "ux", "zeta"].every((name) => inDoc(`work-filter-option-${name}`))).toBe(true);
    await press("work-filter-option-api");
    await press("work-filter-option-ux");
    expect(wrapper.get("[data-testid='work-board-filters-open']").text()).toBe("Filters · 2");
    expect(wrapper.findAll("[data-testid^='work-filter-label-']").map((chip) => chip.text())).toEqual(["api", "ux"]);
    await wrapper.get("[data-testid='work-filter-label-ux']").trigger("click");
    expect(has(wrapper, "work-card-NEO-5")).toBe(true);
    await wrapper.get("[data-testid='work-board-clear-filters']").trigger("click");
    await flushPromises();
    expect(has(wrapper, "work-card-CORE-3")).toBe(true);
    expect(router.currentRoute.value.query.labels).toBeUndefined();
  });

  it("shows one status per screen under tabs with counts on a phone (r2 D3)", async () => {
    serve([item({ key: "CORE-1" }), item({ key: "CORE-2" }), item({ key: "CORE-3", status: "building" }), item({ key: "CORE-4", status: "done" })]);
    const { wrapper } = await render(375);
    const tabs = () => wrapper.findAll("[role='tab']");
    const selected = () => tabs().find((tab) => tab.attributes("aria-selected") === "true")!.text();
    expect(tabs().map((tab) => tab.text())).toEqual(["Backlog 2", "Building 1", "Done 1"]);
    expect(selected()).toBe("Backlog 2");
    expect(has(wrapper, "work-card-CORE-1")).toBe(true);
    expect(has(wrapper, "work-card-CORE-3")).toBe(false);
    await wrapper.get("[data-testid='work-tab-done']").trigger("click");
    expect(has(wrapper, "work-card-CORE-4")).toBe(true);
    expect(has(wrapper, "work-card-CORE-1")).toBe(false);
  });

  it("moves between the phone tabs with a sideways swipe and remembers each tab's scroll (r2 D3)", async () => {
    serve([item({ key: "CORE-1" }), item({ key: "CORE-3", status: "building" }), item({ key: "CORE-4", status: "done" })]);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { wrapper } = await render(375);
    const list = wrapper.get("[data-testid='work-board-list']");
    const swipe = async (dx: number, dy = 0) => {
      await list.trigger("touchstart", { touches: [{ clientX: 200, clientY: 300 }] });
      await list.trigger("touchend", { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
      await flushPromises();
    };
    Object.defineProperty(window, "scrollY", { value: 420, configurable: true });
    await swipe(-30);
    await swipe(-90, 200);
    expect(has(wrapper, "work-card-CORE-1")).toBe(true);
    await swipe(-90, 10);
    expect(has(wrapper, "work-card-CORE-3")).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    await swipe(90);
    expect(has(wrapper, "work-card-CORE-1")).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 420 });
    await swipe(90);
    expect(has(wrapper, "work-card-CORE-1")).toBe(true);
    scrollTo.mockRestore();
  });

  it("moves to the first tab that still has tickets when a filter empties the open one (r2 D3)", async () => {
    serve([item({ key: "CORE-1" }), item({ key: "CORE-3", status: "building", labels: ["session"] })]);
    const { wrapper } = await render(375);
    expect(has(wrapper, "work-card-CORE-1")).toBe(true);
    await wrapper.get("[data-testid='work-board-session-filter']").trigger("click");
    expect(wrapper.findAll("[role='tab']").map((tab) => tab.text())).toEqual(["Building 1"]);
    expect(has(wrapper, "work-card-CORE-3")).toBe(true);
  });

  it("keeps a phone's top to search, sessions and Filters; the sheet holds the rest (r2 D4)", async () => {
    serve([...board(), item({ key: "CORE-9", status: "canceled" })], TEAMS, { labels: CATALOG });
    const { wrapper } = await render(375);
    expect(has(wrapper, "work-board-search")).toBe(true);
    expect(has(wrapper, "work-board-session-filter")).toBe(true);
    expect(has(wrapper, "work-board-teams")).toBe(false);
    expect(has(wrapper, "work-board-view")).toBe(false);
    await openFilters(wrapper);
    const sheet = inDoc("work-board-sheet")!;
    for (const id of ["work-board-teams", "work-filter-option-api", "work-board-sort", "work-board-density", "work-board-canceled", "work-board-tokens"]) {
      expect(sheet.querySelector(`[data-testid='${id}']`), id).not.toBeNull();
    }
    expect(sheet.textContent).not.toContain("move the focused card");
    await press("work-board-canceled");
    await press("work-filter-option-api");
    [...sheet.querySelectorAll<HTMLElement>("[data-testid='work-board-teams'] button")].find((b) => b.textContent!.trim() === "NEO")!.click();
    await flushPromises();
    expect(has(wrapper, "work-card-NEO-5")).toBe(true);
    expect(has(wrapper, "work-card-CORE-1")).toBe(false);
    expect(wrapper.get("[data-testid='work-board-filters-count']").text()).toBe("3");
  });

  it("opens a new item from the floating button on a phone (r2 D4)", async () => {
    serve(board());
    const { wrapper } = await render(375);
    const fab = wrapper.get("[data-testid='work-board-new']");
    expect(fab.classes()).toContain("work-toolbar__fab");
    expect(fab.attributes("aria-label")).toBe("New item");
    await fab.trigger("click");
    await flushPromises();
    expect(document.querySelector("[data-testid='work-item-dialog']")).not.toBeNull();
  });

  it("shows compact cards on a phone until switched off there, apart from the desktop choice (r2 D5)", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const phone = await render(375);
    expect(phone.wrapper.get("[data-testid='work-card-CORE-1']").classes()).toContain("work-card--dense");
    await openFilters(phone.wrapper);
    expect(inDoc("work-board-density")!.getAttribute("aria-pressed")).toBe("true");
    await press("work-board-density");
    expect(phone.wrapper.get("[data-testid='work-card-CORE-1']").classes()).not.toContain("work-card--dense");
    phone.wrapper.unmount();
    wrappers.length = 0;

    const again = await render(375);
    expect(again.wrapper.get("[data-testid='work-card-CORE-1']").classes()).not.toContain("work-card--dense");
    again.wrapper.unmount();
    wrappers.length = 0;
    localStorage.clear();

    const desktop = await render();
    expect(desktop.wrapper.get("[data-testid='work-card-CORE-1']").classes()).not.toContain("work-card--dense");
  });

  it("recolours a label on the cards", async () => {
    serve(board(), TEAMS, { labels: CATALOG });
    const { wrapper } = await render();
    const chip = () => wrapper.get("[data-testid='work-card-CORE-1'] [data-testid='work-card-label-api']").classes();
    expect(chip()).toContain("work-label--blue");
    await openView(wrapper);
    await press("work-board-edit-labels");
    (document.querySelector("[data-testid='work-label-color-l-api']") as HTMLElement).click();
    await flushPromises();
    (document.querySelector("[data-testid='work-label-color-l-api-red']") as HTMLElement).click();
    await flushPromises();
    const patch = apiFetch.mock.calls.find(([path]) => String(path).endsWith("/labels/l-api"))!;
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ color: "red" });
    expect(chip()).toContain("work-label--red");
  });
});

describe("useWorkBoard label and card helpers (CORE-219)", () => {
  const NOW = Date.parse("2026-11-16T12:00:00Z");
  const DAY = 86_400_000;
  const at = (ms: number) => new Date(NOW - ms).toISOString();

  it("matches items that carry every selected label, whatever the case", () => {
    const it1 = item({ labels: ["API", "ux"] });
    expect(matchesLabels(it1, [])).toBe(true);
    expect(matchesLabels(it1, ["api"])).toBe(true);
    expect(matchesLabels(it1, ["api", "UX"])).toBe(true);
    expect(matchesLabels(it1, ["api", "billing"])).toBe(false);
  });

  it("puts each item in one lane: its first label by name, session never counts", () => {
    const lanes = groupByLabel([
      item({ key: "CORE-1", labels: ["ux", "API"] }),
      item({ key: "CORE-2", labels: ["session"] }),
      item({ key: "CORE-3", labels: ["api"] }),
      item({ key: "CORE-4", labels: ["Billing"] }),
    ]);
    expect(lanes.map((lane) => [lane.label, lane.items.map((i) => i.key)])).toEqual([
      ["API", ["CORE-1", "CORE-3"]],
      ["Billing", ["CORE-4"]],
      [null, ["CORE-2"]],
    ]);
    expect(groupByLabel([item({ labels: ["api"] })]).map((lane) => lane.label)).toEqual(["api"]);
  });

  it("counts whole days in the column and flags only long waits in Needs Review and Building", () => {
    expect(daysInColumn(item({ status_changed_at: at(DAY - 1) }), NOW)).toBe(0);
    expect(daysInColumn(item({ status_changed_at: at(2 * DAY) }), NOW)).toBe(2);
    expect(daysInColumn(item({ status_changed_at: at(-DAY) }), NOW)).toBe(0);
    expect(isStale(item({ status: "needs_review", status_changed_at: at(3 * DAY) }), NOW)).toBe(false);
    expect(isStale(item({ status: "needs_review", status_changed_at: at(4 * DAY) }), NOW)).toBe(true);
    expect(isStale(item({ status: "building", status_changed_at: at(7 * DAY) }), NOW)).toBe(false);
    expect(isStale(item({ status: "building", status_changed_at: at(8 * DAY) }), NOW)).toBe(true);
    expect(isStale(item({ status: "backlog", status_changed_at: at(90 * DAY) }), NOW)).toBe(false);
  });

  it("calls an open item overdue from the day after its due date", () => {
    const today = new Date(NOW);
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const yesterday = ymd(new Date(NOW - DAY));
    expect(isOverdue(item({ due_date: ymd(today) }), NOW)).toBe(false);
    expect(isOverdue(item({ due_date: yesterday }), NOW)).toBe(true);
    expect(isOverdue(item({ due_date: yesterday, status: "done" }), NOW)).toBe(false);
    expect(isOverdue(item({ due_date: yesterday, status: "canceled" }), NOW)).toBe(false);
    expect(isOverdue(item({ due_date: null }), NOW)).toBe(false);
  });

  it("keeps the live dot for 15 minutes after a session's touch", () => {
    expect(isLive(at(14 * 60_000 + 59_000), NOW)).toBe(true);
    expect(isLive(at(15 * 60_000), NOW)).toBe(false);
    expect(isLive(null, NOW)).toBe(false);
    expect(isLive(undefined, NOW)).toBe(false);
  });

  it("shortens an assignee to two letters", () => {
    expect(initialsOf("lukasz.ostrowski@neosleepcare.com")).toBe("LO");
    expect(initialsOf("Ana María López")).toBe("AL");
    expect(initialsOf("qa@neosleepcare.com")).toBe("QA");
  });
});

describe("useWorkBoard helpers", () => {
  it("sorts a column urgent first, no priority last, then newest move", () => {
    const groups = groupByStatus([
      item({ key: "CORE-1", priority: 0 }),
      item({ key: "CORE-2", priority: 3, status_changed_at: "2026-10-01T00:00:00Z" }),
      item({ key: "CORE-3", priority: 1 }),
      item({ key: "CORE-4", priority: 3, status_changed_at: "2026-10-05T00:00:00Z" }),
    ]);
    expect(groups.backlog.map((i) => i.key)).toEqual(["CORE-3", "CORE-4", "CORE-2", "CORE-1"]);
  });

  it("finds neighbour columns and stops at the edges and for canceled", () => {
    expect(neighbourStatus("triage", -1)).toBeNull();
    expect(neighbourStatus("spec_ready", 1)).toBe("approved");
    expect(neighbourStatus("done", 1)).toBeNull();
    expect(neighbourStatus("canceled", 1)).toBeNull();
  });

  it("matches the key or title, case-insensitive", () => {
    const it1 = item({ key: "CORE-12", title: "Kanban board" });
    expect(matchesQuery(it1, "core-12")).toBe(true);
    expect(matchesQuery(it1, "KANBAN")).toBe(true);
    expect(matchesQuery(it1, "linear")).toBe(false);
    expect(matchesQuery(it1, "  ")).toBe(true);
  });

  it("shows the git marker only where it says something (CORE-221)", () => {
    expect(gitMarker(item({ status: "building", git_state: null }))).toBeNull();
    expect(gitMarker(item({ status: "building", git_state: "none" }))).toBe("none");
    expect(gitMarker(item({ status: "needs_review", git_state: "prod" }))).toBe("prod");
    expect(gitMarker(item({ status: "approved", git_state: "none" }))).toBeNull();
    expect(gitMarker(item({ status: "approved", git_state: "dev" }))).toBe("dev");
    expect(gitMarker(item({ status: "done", git_state: "prod" }))).toBeNull();
    expect(gitMarker(item({ status: "canceled", git_state: "dev" }))).toBeNull();
  });

  it("calls a Needs Review ticket out of step when nothing is merged or it is on prod unheld (CORE-221)", () => {
    expect(outOfStep(item({ status: "needs_review", git_state: "none" }))).toBe(true);
    expect(outOfStep(item({ status: "needs_review", git_state: "prod" }))).toBe(true);
    expect(outOfStep(item({ status: "needs_review", git_state: "prod", labels: ["hold"] }))).toBe(false);
    expect(outOfStep(item({ status: "needs_review", git_state: "dev" }))).toBe(false);
    expect(outOfStep(item({ status: "needs_review", git_state: null }))).toBe(false);
    expect(outOfStep(item({ status: "building", git_state: "prod" }))).toBe(false);
  });
});
