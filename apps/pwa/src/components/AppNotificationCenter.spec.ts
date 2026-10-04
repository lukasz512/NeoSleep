import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import pl from "@i18n/pl.json";
import mx from "@i18n/mx.json";

// The API boundary is the only fake: the composable, grouping and rows are real.
const apiFetch = vi.fn();
vi.mock("../composables/useApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import AppNotificationCenter from "./AppNotificationCenter.vue";
import { useNotificationCenter } from "../composables/useNotificationCenter";

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

const ROWS = [
  {
    id: "n1",
    type: "appointment_patient_cannot_attend",
    title: "A patient can't come to an appointment",
    body: "Open NeoSleep to see the details and find a new time.",
    entity_type: "Appointment",
    entity_id: "a1",
    action_url: "/appointments",
    read_at: null,
    created_at: minutesAgo(12),
    group_count: 1,
    subject_name: "Mariana Ruiz",
    subject_at: null,
    actions: [
      { kind: "call", href: "tel:+525512345678" },
      { kind: "reschedule", href: "/appointments" },
    ],
  },
  {
    id: "n2",
    type: "questionnaire_submitted",
    title: "Questionnaire submitted",
    body: "A patient completed a questionnaire. Open NeoSleep to see the details.",
    entity_type: "QuestionnaireRequest",
    entity_id: "q1",
    action_url: "/patients/p1?tab=studies",
    read_at: null,
    created_at: minutesAgo(30),
    group_count: 3,
    subject_name: "Jorge Peña",
    subject_at: null,
    actions: [],
  },
];

function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
}

const wrappers: VueWrapper[] = [];
beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((url: string) => (url.startsWith("/api/v1/notification?") ? respond({ items: ROWS, total: 2 }) : respond({})));
  useNotificationCenter().unreadCount.value = 2;
});
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
  Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
});

async function mountBell({ phone = false } = {}) {
  Object.defineProperty(window, "innerWidth", { value: phone ? 390 : 1024, configurable: true });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en, pl, mx } });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { render: () => null } }] });
  const wrapper = mount(AppNotificationCenter, { global: { plugins: [i18n, createVuetify(), router, createPinia()] }, attachTo: document.body });
  wrappers.push(wrapper);
  await router.isReady();
  return wrapper;
}

async function openBell(wrapper: VueWrapper) {
  await wrapper.get(".notif-center__bell").trigger("click");
  await flushPromises();
}

const card = () => document.querySelector<HTMLElement>('[data-testid="notification-center"]')!;

describe("AppNotificationCenter — glass card (CORE-4)", () => {
  describe("badge", () => {
    it("shows the unread count up to 9, then 9+, and nothing at 0", async () => {
      const wrapper = await mountBell();
      expect(wrapper.get(".notif-center__badge").text()).toBe("2");
      useNotificationCenter().unreadCount.value = 12;
      await flushPromises();
      expect(wrapper.get(".notif-center__badge").text()).toBe("9+");
      useNotificationCenter().unreadCount.value = 0;
      await flushPromises();
      expect(wrapper.find(".notif-center__badge").exists()).toBe(false);
    });
  });

  it("opens the shared glass card, with the bell as the anchor that flies in", async () => {
    const wrapper = await mountBell();
    await openBell(wrapper);
    expect(card().classList.contains("glass-popover__card")).toBe(true);
    expect(card().getAttribute("role")).toBe("dialog");
    expect(wrapper.find('.notif-center__bell [data-motion="trigger-avatar"]').exists()).toBe(true);
    expect(card().querySelector('[data-motion="avatar"]')).not.toBeNull();
  });

  it("pins events with quick actions under Needs action, the rest under Today", async () => {
    const wrapper = await mountBell();
    await openBell(wrapper);
    const headings = [...card().querySelectorAll(".notif-center__group-title")].map((h) => h.textContent?.trim());
    expect(headings).toEqual(["Needs action", "Today"]);
  });

  it("names the patient and uses the short in-app title instead of the push copy", async () => {
    const wrapper = await mountBell();
    await openBell(wrapper);
    const first = card().querySelector<HTMLElement>('[data-testid="notif-row-n1"]')!;
    expect(first.querySelector(".notif-row__title")?.textContent?.trim()).toBe("Can't attend");
    expect(first.querySelector(".notif-row__context")?.textContent).toContain("Mariana Ruiz");
    expect(first.textContent).not.toContain("Open NeoSleep");
    expect(first.querySelector(".notif-row__time")?.textContent?.trim()).toBe("12 min");
  });

  it("shows how many events a folded row stands for", async () => {
    const wrapper = await mountBell();
    await openBell(wrapper);
    const second = card().querySelector<HTMLElement>('[data-testid="notif-row-n2"]')!;
    expect(second.querySelector(".notif-row__context")?.textContent).toContain("3 updates");
  });

  it("shows Call and Find new time only on the Needs action row", async () => {
    const wrapper = await mountBell();
    await openBell(wrapper);
    const actions = [...card().querySelectorAll<HTMLAnchorElement>('[data-testid="notif-row-n1"] .notif-row__action')];
    expect(actions.map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual([
      ["Call", "tel:+525512345678"],
      ["Find new time", "/appointments"],
    ]);
    expect(card().querySelectorAll('[data-testid="notif-row-n2"] .notif-row__action')).toHaveLength(0);
  });

  it("marks a row read when it is opened", async () => {
    const wrapper = await mountBell();
    await openBell(wrapper);
    card().querySelector<HTMLElement>('[data-testid="notif-row-n2"] .notif-row__main')!.click();
    await flushPromises();
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/notification/n2/read", expect.objectContaining({ method: "PATCH" }));
  });

  describe("swipe left to mark read (phone)", () => {
    function pointer(target: EventTarget, type: string, clientX: number) {
      const e = new MouseEvent(type, { clientX, clientY: 200, button: 0, bubbles: true });
      Object.defineProperty(e, "pointerId", { value: 7 });
      target.dispatchEvent(e);
    }

    async function swipe(dx: number) {
      const wrapper = await mountBell({ phone: true });
      await openBell(wrapper);
      const row = card().querySelector<HTMLElement>('[data-testid="notif-row-n2"] .notif-row__swipe')!;
      pointer(row, "pointerdown", 300);
      pointer(window, "pointermove", 300 + dx / 2);
      pointer(window, "pointermove", 300 + dx);
      pointer(window, "pointerup", 300 + dx);
      await flushPromises();
      return row;
    }

    it("marks read past 72 px", async () => {
      await swipe(-80);
      expect(apiFetch).toHaveBeenCalledWith("/api/v1/notification/n2/read", expect.objectContaining({ method: "PATCH" }));
    });

    it("springs back from a shorter swipe without marking read", async () => {
      const row = await swipe(-40);
      expect(apiFetch).not.toHaveBeenCalledWith("/api/v1/notification/n2/read", expect.anything());
      expect(row.style.transform).toBe("");
    });
  });

  it("has no 'See all' link yet — history is its own ticket (CORE-4 D3)", async () => {
    const wrapper = await mountBell();
    await openBell(wrapper);
    expect(card().textContent).not.toMatch(/see all/i);
  });
});
