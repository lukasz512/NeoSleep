import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { ref } from "vue";
import en from "@i18n/en.json";

const push = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));
vi.mock("../composables/useApi", async (orig) => ({
  ...(await orig<typeof import("../composables/useApi")>()),
  apiFetch: vi.fn(),
}));
vi.mock("../composables/useAiChat", async (orig) => ({
  ...(await orig<typeof import("../composables/useAiChat")>()),
  askNeoSleepAi: vi.fn(),
}));
vi.mock("../composables/useVisibleNavRoutes", () => ({
  useVisibleNavRoutes: () => ({
    visibleNavItems: ref([
      { path: "/patients", name: "patients", label: "Patients" },
      { path: "/calendar", name: "calendar", label: "Calendar" },
    ]),
  }),
}));

import { apiFetch } from "../composables/useApi";
import { askNeoSleepAi } from "../composables/useAiChat";
import { SEARCH_DEBOUNCE_MS } from "../composables/useGlobalSearch";
import { useAuthStore } from "../stores/auth";
import GlobalSearchPalette from "./GlobalSearchPalette.vue";

const groups = {
  patients: [{ id: "p1", label: "Ana Lopez", sublabel: "MX", region: "MX" }],
  practitioners: [{ id: "d1", label: "Dr Ruiz", sublabel: "", region: "MX" }],
  organizations: [{ id: "o1", label: "Clinica Norte", sublabel: "", region: "MX" }],
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let wrapper: VueWrapper | undefined;

function mountPalette(role: "admin" | "rep" = "admin") {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().$patch({ user: { id: "u1", role } as never });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en: en as never }, missingWarn: false });
  wrapper = mount(GlobalSearchPalette, {
    props: { open: true },
    global: { plugins: [pinia, i18n], stubs: { teleport: true } },
    attachTo: document.body,
  });
  return wrapper;
}

async function typeTerm(w: VueWrapper, text: string) {
  await w.get('[data-testid="gs-input"]').setValue(text);
  await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
  await flushPromises();
}

beforeEach(() => {
  vi.useFakeTimers();
  push.mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(askNeoSleepAi).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(reply(200, groups));
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});

describe("GlobalSearchPalette (CORE-292)", () => {
  it("is a modal dialog with a combobox wired to a listbox", () => {
    const w = mountPalette();
    const dialog = w.get('[role="dialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");
    const input = w.get('[data-testid="gs-input"]');
    expect(input.attributes("role")).toBe("combobox");
    expect(input.attributes("aria-controls")).toBe(w.get('[role="listbox"]').attributes("id"));
  });

  it("is absent from the DOM when closed", () => {
    const w = mountPalette();
    return w.setProps({ open: false }).then(() => {
      expect(w.find('[role="dialog"]').exists()).toBe(false);
    });
  });

  it("lists the visible pages before anything is typed", () => {
    const w = mountPalette();
    const labels = w.findAll('[role="option"]').map((o) => o.text());
    expect(labels).toHaveLength(2);
  });

  it("shows record groups after the debounce and opens a hit with the right route", async () => {
    const w = mountPalette();
    await typeTerm(w, "ana");
    expect(w.text()).toContain("Ana Lopez");
    expect(w.text()).toContain("Dr Ruiz");
    await w.get('[data-testid="gs-option-patient-p1"]').trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "patient-detail", params: { id: "p1" } });
    await w.get('[data-testid="gs-option-practitioner-d1"]').trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "hcp-detail", params: { id: "d1" } });
    await w.get('[data-testid="gs-option-organization-o1"]').trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "hco-detail", params: { id: "o1" } });
    expect(w.emitted("update:open")?.at(-1)).toEqual([false]);
  });

  it("moves the active option with the arrows and activates it with Enter", async () => {
    const w = mountPalette();
    const input = w.get('[data-testid="gs-input"]');
    await input.trigger("keydown", { key: "ArrowDown" });
    const active = input.attributes("aria-activedescendant");
    expect(active).toBeTruthy();
    expect(w.get(`#${active}`).attributes("aria-selected")).toBe("true");
    await input.trigger("keydown", { key: "Enter" });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter while an IME composition is running", async () => {
    const w = mountPalette();
    const input = w.get('[data-testid="gs-input"]');
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter", isComposing: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("announces the result count in a live region", async () => {
    const w = mountPalette();
    await typeTerm(w, "ana");
    expect(w.get('[aria-live="polite"]').text()).toContain("3 results");
  });

  it("says so when the search is rate limited or fails", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(reply(429, {}));
    const w = mountPalette();
    await typeTerm(w, "ana");
    expect(w.get('[data-testid="gs-status"]').text()).toBe(en["search.rate_limited"]);
  });

  it("offers Ask AI only to roles that can use it", async () => {
    const rep = mountPalette("rep");
    await typeTerm(rep, "ana");
    expect(rep.find('[data-testid="gs-ai-entry"]').exists()).toBe(false);
    rep.unmount();

    const admin = mountPalette("admin");
    await typeTerm(admin, "ana");
    expect(admin.find('[data-testid="gs-ai-entry"]').exists()).toBe(true);
  });

  it("asks the AI from the entry, renders the answer as text and Esc goes back to search first", async () => {
    vi.mocked(askNeoSleepAi).mockResolvedValue({ ok: true, answer: "<b>Use the guide</b>" });
    const w = mountPalette("admin");
    await typeTerm(w, "how to invite");
    await w.get('[data-testid="gs-ai-entry"]').trigger("click");
    await flushPromises();
    expect(askNeoSleepAi).toHaveBeenCalledWith("how to invite");
    const answer = w.get('[data-testid="gs-ai-answer"]');
    expect(answer.text()).toBe("<b>Use the guide</b>");
    expect(answer.find("b").exists()).toBe(false);

    await w.get('[role="dialog"]').trigger("keydown", { key: "Escape" });
    expect(w.find('[data-testid="gs-ai-panel"]').exists()).toBe(false);
    expect(w.emitted("update:open")).toBeUndefined();

    await w.get('[role="dialog"]').trigger("keydown", { key: "Escape" });
    expect(w.emitted("update:open")?.at(-1)).toEqual([false]);
  });

  it("keeps the question and shows the localized reason when the AI fails", async () => {
    vi.mocked(askNeoSleepAi).mockResolvedValue({ ok: false, reason: "rate_limited" });
    const w = mountPalette("admin");
    await typeTerm(w, "how to invite");
    await w.get('[data-testid="gs-input"]').trigger("keydown", { key: "Enter", metaKey: true });
    await flushPromises();
    expect(w.get('[data-testid="gs-ai-error"]').text()).toBe(en["ai.error.rate_limited"]);
    expect((w.get('[data-testid="gs-ai-question"]').element as HTMLTextAreaElement).value).toBe("how to invite");
  });

  it("does not open AI mode on Cmd+Enter for a role without access", async () => {
    const w = mountPalette("rep");
    await typeTerm(w, "how to invite");
    await w.get('[data-testid="gs-input"]').trigger("keydown", { key: "Enter", metaKey: true });
    expect(w.find('[data-testid="gs-ai-panel"]').exists()).toBe(false);
    expect(askNeoSleepAi).not.toHaveBeenCalled();
  });

  it("clears the term when it closes so the next open starts fresh", async () => {
    const w = mountPalette();
    await typeTerm(w, "ana");
    await w.setProps({ open: false });
    await w.setProps({ open: true });
    expect((w.get('[data-testid="gs-input"]').element as HTMLInputElement).value).toBe("");
  });
});
