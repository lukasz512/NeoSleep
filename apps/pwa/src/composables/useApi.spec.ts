import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { apiFetch } from "./useApi";
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

  describe("JSDoc rule marker", () => {
    it("keeps the do-not-change rule documented for future readers", () => {
      const source = readFileSync(path.resolve(__dirname, "./useApi.ts"), "utf-8");
      expect(source).toContain("Error notification display (do not change)");
      expect(source).toContain("Never show raw JSON in the notification");
    });
  });
});
