// NEO-277: the email dialog closes the moment the send succeeded, so sendByEmail must resolve
// without waiting for the checklist reload that follows it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));

const apiFetch = vi.fn();
vi.mock("./useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useApi")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { usePatientChecklist } from "./usePatientChecklist";

describe("usePatientChecklist › sendByEmail (NEO-277)", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    setActivePinia(createPinia());
  });

  it("resolves { ok: true } while the checklist reload is still pending", async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.endsWith("/questionnaire-requests/email")) {
        return Promise.resolve(new Response(JSON.stringify({ sent_to: "a@b.mx", url: "https://x/y" }), { status: 200 }));
      }
      return new Promise(() => {}); // the checklist GET never answers
    });
    const scope = effectScope();
    const checklist = scope.run(() => usePatientChecklist(() => "p1"))!;

    const result = await checklist.sendByEmail({ items: ["a"] });

    expect(result).toEqual({ ok: true, sent_to: "a@b.mx", url: "https://x/y" });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/p1/checklist", expect.anything());
    scope.stop();
  });
});
