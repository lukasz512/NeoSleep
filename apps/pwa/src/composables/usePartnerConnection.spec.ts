import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.fn();
const show = vi.fn();

vi.mock("./useApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("./useNotifications", () => ({ useNotifications: () => ({ show }) }));
vi.mock("../plugins/i18n", () => ({ i18n: { global: { t: (key: string) => key } } }));

function statusResponse(body: Record<string, unknown>): Response {
  return { ok: true, json: async () => body } as Response;
}

async function load() {
  vi.resetModules(); // fresh per-partner toast cooldown per test
  return import("./usePartnerConnection");
}

beforeEach(() => {
  apiFetch.mockReset();
  show.mockReset();
});

describe("ensurePartnerConnection", () => {
  it("stays silent when the partner is connected", async () => {
    apiFetch.mockResolvedValue(statusResponse({ connected: true, attemptsExhausted: false }));
    const { ensurePartnerConnection } = await load();
    await ensurePartnerConnection("orthoapnea");
    expect(show).not.toHaveBeenCalled();
  });

  it("tells the rep to get an administrator, not to reload, when OrthoApnea rejects the server login", async () => {
    apiFetch.mockResolvedValue(
      statusResponse({ connected: false, attemptsExhausted: true, reason: "credentials_rejected" })
    );
    const { ensurePartnerConnection } = await load();
    await ensurePartnerConnection("orthoapnea");
    expect(show).toHaveBeenCalledWith("app.partners.connectionErrorConfig", "warning");
  });

  it("keeps the retry/reload messaging for outages", async () => {
    apiFetch.mockResolvedValue(statusResponse({ connected: false, attemptsExhausted: true, reason: "unreachable" }));
    const { ensurePartnerConnection } = await load();
    await ensurePartnerConnection("orthoapnea");
    expect(show).toHaveBeenCalledWith("app.partners.connectionErrorPersistent", "warning");
  });

  it("treats our own API failing as a generic connection error", async () => {
    apiFetch.mockResolvedValue({ ok: false } as Response);
    const { ensurePartnerConnection } = await load();
    await ensurePartnerConnection("orthoapnea");
    expect(show).toHaveBeenCalledWith("app.partners.connectionError", "warning");
  });
});
