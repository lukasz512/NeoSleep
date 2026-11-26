import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, RouterLinkStub, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import ErrorsPanel from "./ErrorsPanel.vue";
import type { DiagnosticGroup, DiagnosticTicket } from "../../types/issues";

/** CORE-227: one screen for errors — env switch, one state chip per row, counters that filter, ticket links. */
const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("../../composables/useNotifications", () => ({ useNotifications: () => ({ show: vi.fn() }) }));

function ticket(patch: Partial<DiagnosticTicket>): DiagnosticTicket {
  return { key: "CORE-300", status: "triage", branch: null, status_changed_at: new Date().toISOString(), artifact_url: null, pr_url: null, blocked_reason: null, ...patch };
}

function group(id: string, patch: Partial<DiagnosticGroup> = {}): DiagnosticGroup {
  return {
    id,
    level: "error",
    message: `boom ${id}`,
    stack: null,
    source: "api",
    env: "prod",
    tenant_slug: "neosleep",
    user_id: null,
    request_id: null,
    count: 3,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    status: "open",
    metadata: null,
    linked_reports: [],
    ticket: null,
    ...patch,
  };
}

const PROD: DiagnosticGroup[] = [
  group("fresh"),
  group("queued", { ticket: ticket({ key: "CORE-301", status: "approved" }) }),
  group("fixing", { ticket: ticket({ key: "CORE-302", status: "building", branch: "worktree-core-302" }) }),
  group("stuck", { ticket: ticket({ key: "CORE-303", status: "building", blocked_reason: "cannot reproduce" }) }),
  group("ready", {
    ticket: ticket({ key: "CORE-304", status: "needs_review", artifact_url: "https://claude.ai/artifact/abc", pr_url: "https://github.com/example/repo/compare/dev...x" }),
  }),
  group("closed", { status: "resolved" }),
  group("ignored", { status: "dismissed" }),
];

let byEnv: Record<string, DiagnosticGroup[]>;
const wrappers: VueWrapper[] = [];

beforeEach(() => {
  byEnv = { prod: PROD, dev: [group("dev-only", { env: "dev" })], production: [group("legacy", { env: "production" })] };
  apiFetch.mockImplementation(async (path: string) => {
    const env = new URL(path, "http://x").searchParams.get("env") ?? "";
    return { ok: true, status: 200, json: async () => ({ items: byEnv[env] ?? [] }) } as Response;
  });
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const byTestId = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const rowIds = () => [...document.body.querySelectorAll<HTMLElement>("[data-testid^='error-row-']")].map((el) => el.dataset.testid!.replace("error-row-", ""));
const chipOf = (id: string) => byTestId(`error-item-${id}`)!.querySelector<HTMLElement>("[data-testid^='issue-state-']")!.dataset.testid;

async function render() {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(ErrorsPanel, { global: { plugins: [i18n, vuetify], stubs: { RouterLink: RouterLinkStub } }, attachTo: document.body });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

async function pickEnv(label: string) {
  [...document.body.querySelectorAll<HTMLElement>("[role='tab']")].find((el) => el.textContent?.trim() === label)!.click();
  await flushPromises();
}

describe("ErrorsPanel", () => {
  it("switches env, prod first, and never shows a dev error under prod", async () => {
    await render();
    expect(apiFetch.mock.calls[0]![0]).toBe("/api/v1/admin/diagnostics?status=all&env=prod");
    expect(rowIds()).not.toContain("dev-only");

    await pickEnv("Dev");
    expect(apiFetch.mock.calls.at(-1)![0]).toBe("/api/v1/admin/diagnostics?status=all&env=dev");
    expect(rowIds()).toEqual(["dev-only"]);
  });

  it("gives each row one state chip and hides closed rows until asked", async () => {
    await render();
    expect(rowIds()).toEqual(["fresh", "queued", "fixing", "stuck", "ready"]);
    expect(["fresh", "queued", "fixing", "stuck", "ready"].map(chipOf)).toEqual([
      "issue-state-new",
      "issue-state-ticket",
      "issue-state-being_fixed",
      "issue-state-needs_you",
      "issue-state-artifact_ready",
    ]);
    expect(byTestId("error-item-stuck")!.textContent).toContain("cannot reproduce");

    byTestId("issue-counter-all")!.click();
    await flushPromises();
    expect(rowIds()).toEqual(["fresh", "queued", "fixing", "stuck", "ready", "closed", "ignored"]);
    expect([chipOf("closed"), chipOf("ignored")]).toEqual(["issue-state-done", "issue-state-dismissed"]);
  });

  it("counts four buckets and a counter filters the list", async () => {
    await render();
    const numbers = ["new", "fixing", "ready", "done"].map((b) => byTestId(`issue-counter-${b}`)!.querySelector(".issue-counters__number")!.textContent);
    expect(numbers).toEqual(["2", "2", "1", "1"]);

    byTestId("issue-counter-fixing")!.click();
    await flushPromises();
    expect(rowIds()).toEqual(["fixing", "stuck"]);

    byTestId("issue-counter-fixing")!.click();
    await flushPromises();
    expect(rowIds()).toHaveLength(5);
  });

  it("shows the Artifact button only with a link, and links the ticket to its board card", async () => {
    await render();
    const artifact = byTestId("error-artifact-ready")!;
    expect(artifact.getAttribute("href")).toBe("https://claude.ai/artifact/abc");
    expect(artifact.getAttribute("target")).toBe("_blank");
    expect(byTestId("error-changes-ready")!.getAttribute("href")).toBe("https://github.com/example/repo/compare/dev...x");
    expect(byTestId("error-artifact-fixing")).toBeNull();
    expect(byTestId("error-changes-fixing")).toBeNull();
    expect(byTestId("error-ticket-fixing")!.textContent).toContain("CORE-302");
    expect(byTestId("error-ticket-fresh")).toBeNull();
  });

  it("keeps the archive view only: legacy rows, no counters, no status buttons", async () => {
    await render();
    await pickEnv("Archive");
    expect(apiFetch.mock.calls.at(-1)![0]).toBe("/api/v1/admin/diagnostics?status=all&env=production");
    expect(rowIds()).toEqual(["legacy"]);
    expect(byTestId("issue-counter-new")).toBeNull();

    byTestId("error-row-legacy")!.click();
    await flushPromises();
    expect(byTestId("error-detail")).not.toBeNull();
    expect(byTestId("error-resolve")).toBeNull();
    expect(byTestId("error-dismiss")).toBeNull();
  });

  it("says what was checked when an env has no errors", async () => {
    byEnv.dev = [];
    await render();
    await pickEnv("Dev");
    const text = byTestId("errors-empty")!.textContent ?? "";
    expect(text).toContain("No dev errors recorded");
    expect(text).toMatch(/Checked at \d/);
  });

  it("polls every 60 s while mounted and stops after", async () => {
    vi.useFakeTimers();
    const wrapper = await render();
    const before = apiFetch.mock.calls.length;
    byEnv.prod = [...PROD, group("late")];
    await vi.advanceTimersByTimeAsync(60_000);
    await flushPromises();
    expect(apiFetch.mock.calls.length).toBe(before + 1);
    expect(rowIds()).toContain("late");

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(apiFetch.mock.calls.length).toBe(before + 1);
  });
});
