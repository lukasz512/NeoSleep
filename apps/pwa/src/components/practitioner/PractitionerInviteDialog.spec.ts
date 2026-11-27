import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { nextTick } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import PractitionerInviteDialog from "./PractitionerInviteDialog.vue";

/** NEO-273: the doctor invite dialog — log rows, explicit send, cooldown countdown. */
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../composables/useApi")>()),
  apiFetch: apiFetchMock,
}));

const mounted: VueWrapper[] = [];
beforeEach(() => {
  apiFetchMock.mockReset();
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const SEND = {
  id: "s1",
  kind: "partner_invite",
  sent_to_masked: "d***@example.com",
  status: "bounced",
  status_detail: "Mailbox does not exist",
  status_at: null,
  created_at: "2026-11-20T10:00:00Z",
  sent_by_name: "Ann Admin",
};

async function mountDialog() {
  const w = mount(PractitionerInviteDialog, {
    props: { modelValue: true, practitionerId: "p1", isResend: true },
    global: {
      plugins: [
        createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
        createI18n({ legacy: false, locale: "en", messages: { en } }),
        createPinia(),
      ],
    },
    attachTo: document.body,
  });
  mounted.push(w);
  await flushPromises();
  await nextTick();
  return w;
}

describe("PractitionerInviteDialog", () => {
  it("lists previous sends with status, detail and sender", async () => {
    apiFetchMock.mockResolvedValueOnce(json(200, { sends: [SEND], cooldownSeconds: 0 }));
    await mountDialog();
    const row = document.querySelector('[data-testid="invite-row-bounced"]');
    expect(row?.textContent).toContain("d***@example.com");
    expect(row?.textContent).toContain("Mailbox does not exist");
    expect(row?.textContent).toContain("Ann Admin");
    expect(row?.textContent).toContain("Didn't arrive");
  });

  it("disables Send and shows a countdown while the cooldown runs", async () => {
    apiFetchMock.mockResolvedValueOnce(json(200, { sends: [SEND], cooldownSeconds: 90 }));
    await mountDialog();
    const button = document.querySelector<HTMLButtonElement>('[data-testid="invite-send"]');
    expect(button?.disabled).toBe(true);
    expect(document.querySelector('[data-testid="invite-cooldown"]')?.textContent).toContain("1:30");
  });

  it("sends on click and starts the countdown from a 429's retryAfter", async () => {
    apiFetchMock
      .mockResolvedValueOnce(json(200, { sends: [], cooldownSeconds: 0 }))
      .mockResolvedValueOnce(json(429, { code: "TOO_MANY_REQUESTS", retryAfter: 120 }));
    await mountDialog();
    expect(document.querySelector('[data-testid="invite-empty"]')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[data-testid="invite-send"]')?.click();
    await flushPromises();
    await nextTick();

    expect(apiFetchMock).toHaveBeenLastCalledWith("/api/v1/practitioner/p1/activate", expect.objectContaining({ method: "POST" }));
    expect(document.querySelector('[data-testid="invite-cooldown"]')?.textContent).toContain("2:00");
    expect(document.querySelector<HTMLButtonElement>('[data-testid="invite-send"]')?.disabled).toBe(true);
  });

  it("emits sent and reloads the log after a successful send", async () => {
    apiFetchMock
      .mockResolvedValueOnce(json(200, { sends: [], cooldownSeconds: 0 }))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(200, { sends: [{ ...SEND, status: "sent", status_detail: null }], cooldownSeconds: 300 }));
    const w = await mountDialog();

    document.querySelector<HTMLButtonElement>('[data-testid="invite-send"]')?.click();
    await flushPromises();
    await nextTick();

    expect(w.emitted("sent")).toHaveLength(1);
    expect(document.querySelector('[data-testid="invite-row-sent"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="invite-cooldown"]')?.textContent).toContain("5:00");
  });
});
