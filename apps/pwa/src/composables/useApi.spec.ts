import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { apiFetch, getRefreshToken, setAuthInterceptor, setRefreshToken } from "./useApi";
import { APP_STORAGE_KEYS } from "../config/storageKeys";
import { useNotifications } from "./useNotifications";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fakeResponse(status: number, bodyText: string): Response {
  return {
    ok: false,
    status,
    statusText: `Status ${status}`,
    clone() {
      return this;
    },
    text: () => Promise.resolve(bodyText),
  } as unknown as Response;
}

describe("apiFetch", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useNotifications().notifications.value = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Behavior contracted in foundation/docs/OBSERVABILITY_AND_LOGGING.md: on a
  // non-ok response, the notification shown to the user must be the extracted
  // error/message string, never the raw JSON body.
  describe("error notification display (see OBSERVABILITY_AND_LOGGING.md)", () => {
    it("extracts the `error` field from a JSON error body instead of showing raw JSON", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(400, JSON.stringify({ error: "Email is required." }))));

      await apiFetch("/api/v1/auth/forgot-password", { method: "POST" });

      const [notification] = useNotifications().notifications.value;
      expect(notification?.message).toBe("Email is required.");
    });

    it("falls back to the `message` field when `error` is absent", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(500, JSON.stringify({ message: "Something broke." }))));

      await apiFetch("/api/v1/leads");

      const [notification] = useNotifications().notifications.value;
      expect(notification?.message).toBe("Something broke.");
    });

    it("unwraps one level of double-encoded JSON (an error string that is itself JSON)", async () => {
      const doubleEncoded = JSON.stringify({ error: JSON.stringify({ error: "Invalid or expired reset link." }) });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(400, doubleEncoded)));

      await apiFetch("/api/v1/auth/reset-password", { method: "POST" });

      const [notification] = useNotifications().notifications.value;
      expect(notification?.message).toBe("Invalid or expired reset link.");
    });

    it("never shows raw markup (e.g. a framework's default HTML error page) in the notification", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(502, "<html><body>Bad Gateway</body></html>")));

      await apiFetch("/api/v1/leads");

      const [notification] = useNotifications().notifications.value;
      expect(notification?.message).not.toContain("<html>");
      expect(notification?.message).toBe("Status 502"); // falls back to res.statusText
    });
  });

  // pwa-dev 2026-10-05: two tabs refreshed with the same rotating token, the API took
  // the second for theft and the session died ("switched to Jan Kowalski").
  describe("silent token refresh", () => {
    const jsonResponse = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    afterEach(() => {
      setRefreshToken(null);
      setAuthInterceptor({ clearAuth: () => {} });
    });

    it("refreshes with the token in storage, i.e. the one another tab just rotated in", async () => {
      setRefreshToken("token-this-tab-saw");
      localStorage.setItem(APP_STORAGE_KEYS.refreshToken, "token-rotated-by-other-tab");
      const sent: string[] = [];
      let calls = 0;
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("/auth/refresh")) {
          sent.push((JSON.parse(String(init?.body)) as { refresh_token: string }).refresh_token);
          return jsonResponse(200, { token: "access-2", refresh_token: "token-3" });
        }
        calls += 1;
        return calls === 1 ? jsonResponse(401, { error: "expired" }) : jsonResponse(200, { ok: true });
      }));

      const res = await apiFetch("/api/v1/leads", { handleErrors: false });

      expect(sent).toEqual(["token-rotated-by-other-tab"]);
      expect(res.status).toBe(200);
      expect(getRefreshToken()).toBe("token-3");
    });

    it("does not sign out when the refresh itself can't reach the API", async () => {
      setRefreshToken("still-valid");
      const clearAuth = vi.fn();
      setAuthInterceptor({ clearAuth });
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/auth/refresh")) throw new TypeError("Failed to fetch");
        return jsonResponse(401, { error: "expired" });
      }));

      await apiFetch("/api/v1/leads", { handleErrors: false });

      expect(clearAuth).not.toHaveBeenCalled();
      expect(getRefreshToken()).toBe("still-valid");
    });

    it("signs out when the API rejects the refresh token", async () => {
      setRefreshToken("revoked");
      const clearAuth = vi.fn();
      setAuthInterceptor({ clearAuth });
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { error: "Session has been logged out." })));

      await apiFetch("/api/v1/leads", { handleErrors: false });

      expect(clearAuth).toHaveBeenCalledOnce();
      expect(getRefreshToken()).toBeNull();
    });
  });

  describe("JSDoc rule marker", () => {
    it("keeps the do-not-change rule documented for future readers", () => {
      const source = readFileSync(path.resolve(__dirname, "./useApi.ts"), "utf-8");
      expect(source).toContain("Error notification display (do not change)");
      expect(source).toContain("Never show raw JSON in the notification");
    });
  });
});
