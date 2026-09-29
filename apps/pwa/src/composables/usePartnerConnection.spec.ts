import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.fn();
vi.mock("./useApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("../plugins/i18n", () => ({
  i18n: { global: { t: (key: string, params?: Record<string, string>) => `${key}${params?.partner ? `:${params.partner}` : ""}` } },
}));

import { ensurePartnerConnection } from "./usePartnerConnection";
import { useNotifications } from "./useNotifications";

function status(connected: boolean) {
  return { ok: true, json: async () => ({ connected, attemptsExhausted: false }) } as Response;
}

beforeEach(() => {
  apiFetch.mockReset();
  useNotifications().notifications.value = [];
});

describe("ensurePartnerConnection", () => {
  it("connected on navigation: no toast at all", async () => {
    apiFetch.mockResolvedValueOnce(status(true));
    await ensurePartnerConnection("orthoapnea");
    expect(useNotifications().notifications.value).toHaveLength(0);
  });

  it("unreachable: warning with the partner as record line and a Retry; Retry that reconnects confirms it", async () => {
    apiFetch.mockResolvedValueOnce(status(false));
    await ensurePartnerConnection("orthoapnea");

    const warning = useNotifications().notifications.value[0]!;
    expect(warning.type).toBe("warning");
    expect(warning.context).toBe("OrthoApnea");
    expect(warning.action?.labelKey).toBe("notification.action.retry");

    useNotifications().notifications.value = [];
    apiFetch.mockResolvedValueOnce(status(true));
    await warning.action!.run();

    const restored = useNotifications().notifications.value[0]!;
    expect(restored.type).toBe("success");
    expect(restored.message).toBe("app.partners.connectionRestored:OrthoApnea");
  });

  it("a Retry that still fails answers again, even inside the navigation cooldown", async () => {
    // Its own partner: the cooldown is module state, the tests above already used orthoapnea's.
    apiFetch.mockResolvedValue(status(false));
    await ensurePartnerConnection("biologix");
    const warning = useNotifications().notifications.value[0]!;
    useNotifications().notifications.value = [];

    await ensurePartnerConnection("biologix"); // navigation again: rate-limited, silent
    expect(useNotifications().notifications.value).toHaveLength(0);

    await warning.action!.run(); // explicit Retry: always gets an answer
    expect(useNotifications().notifications.value[0]?.type).toBe("warning");
  });

  it("server login rejected: tells the rep to get an administrator, not to reload", async () => {
    // Own partner key again — see the cooldown note above.
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ connected: false, attemptsExhausted: true, reason: "credentials_rejected" }),
    } as Response);
    await ensurePartnerConnection("watchpat");
    expect(useNotifications().notifications.value[0]?.message).toBe("app.partners.connectionErrorConfig:watchpat");
  });
});
