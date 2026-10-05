import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiError, configureErrorReporting, reportCaught, resetErrorReportingForTests } from "@api";

vi.mock("./useApi", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "./useApi";
import { buildReportFormData, openReportProblem, useReportProblem } from "./useReportProblem";

beforeEach(() => {
  resetErrorReportingForTests();
  configureErrorReporting({ getApiBase: () => "https://api.example", app: "pwa", sendToServer: false });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  window.history.pushState({}, "", "/patients?search=Maria%20Lopez#secret");
  vi.mocked(apiFetch).mockReset();
});

describe("buildReportFormData", () => {
  it("carries the route without query or fragment, recent errors and deduped request ids", () => {
    reportCaught(new ApiError({ kind: "server", message: "boom", status: 500, requestId: "req-a", path: "/api/v1/x" }), { where: "A.load" });
    const data = buildReportFormData(
      { kind: "problem", description: "  It broke badly  ", appVersion: "Version 1.0.0", file: null },
      { requestId: "req-a" },
    );
    expect(data.get("kind")).toBe("problem");
    expect(data.get("description")).toBe("It broke badly");
    const pageUrl = String(data.get("page_url"));
    expect(pageUrl.endsWith("/patients")).toBe(true);
    expect(pageUrl).not.toContain("search");
    expect(pageUrl).not.toContain("secret");
    expect(JSON.parse(String(data.get("request_ids")))).toEqual(["req-a"]);
    const errors = JSON.parse(String(data.get("recent_errors"))) as { where: string }[];
    expect(errors[0]?.where).toBe("A.load");
    expect(data.get("file")).toBeNull();
    expect(String(data.get("viewport"))).toMatch(/^\d+x\d+$/);
  });
});

describe("useReportProblem", () => {
  it("opens with a prefill", () => {
    openReportProblem({ requestId: "r1", where: "patients" });
    const { state } = useReportProblem();
    expect(state.open).toBe(true);
    expect(state.prefill.requestId).toBe("r1");
  });

  it("returns the report number on success and the status on failure", async () => {
    const { submit } = useReportProblem();
    const form = { kind: "other", description: "long enough text", appVersion: "v" } as const;
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: "1", number: 12 }), { status: 201 }));
    expect(await submit(form)).toEqual({ ok: true, number: 12 });
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response("{}", { status: 429 }));
    expect(await submit(form)).toEqual({ ok: false, status: 429 });
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
    expect(await submit(form)).toEqual({ ok: false, status: null });
  });
});
