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
import { WORK_BOARD_COLUMNS, groupByStatus, matchesQuery, neighbourStatus } from "../composables/useWorkBoard";
import type { WorkItem, WorkTeam } from "../types/workBoard";

/** Platform work board (CORE-177): columns, phone list, team filter, moves and shortcuts. */
const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
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
    source: "manual",
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    status_changed_at: "2026-10-01T10:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function serve(items: WorkItem[], teams: WorkTeam[] | "forbidden" = TEAMS): void {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/platform/work/teams")) {
      if (teams === "forbidden") return { ok: false, status: 403, json: async () => ({ error: "Platform admin only" }), headers: new Headers() } as Response;
      return ok({ items: teams });
    }
    if (path.endsWith("/platform/work/items")) return ok({ items });
    if (init?.method === "PATCH") {
      const key = decodeURIComponent(path.split("/").pop()!);
      const patch = JSON.parse(String(init.body)) as Partial<WorkItem>;
      return ok({ item: { ...items.find((i) => i.key === key)!, ...patch } });
    }
    return ok({ item: items[0], events: [] });
  });
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
});

async function render(width = 1280): Promise<{ wrapper: VueWrapper; router: Router }> {
  window.innerWidth = width;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/platform/board", component: WorkBoardView }] });
  await router.push("/platform/board");
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(WorkBoardView, { global: { plugins: [i18n, vuetify, router] }, attachTo: document.body });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
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
    await wrapper.get("[data-testid='work-board-tokens']").trigger("click");
    await flushPromises();
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

  it("tells a tenant admin the board is for the platform team", async () => {
    serve([], "forbidden");
    const { wrapper } = await render();
    expect(wrapper.text()).toContain("Platform team only");
    expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/items"))).toBe(false);
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
});
