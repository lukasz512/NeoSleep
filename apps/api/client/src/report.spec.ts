import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./errors";
import {
  buildDiagnosticPayload,
  configureErrorReporting,
  reportCaught,
  reportFailedResponse,
  resetErrorReportingForTests,
  scrubPii,
} from "./report";
import { installGlobalErrorHandlers } from "./globalHandlers";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  resetErrorReportingForTests();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", { onLine: true });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  configureErrorReporting({ getApiBase: () => "https://api.example", app: "web", appVersion: "1.2.3" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function sentPayload(call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("scrubPii", () => {
  it("removes emails, phone numbers, bearer tokens, JWTs and URL query strings", () => {
    const input =
      "User maria.lopez@example.mx (+52 55 1234 5678) failed; Authorization: Bearer abc.def-123 " +
      "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U " +
      "at https://pwa.neosleepcare.com/leads?search=Maria%20Lopez#frag";
    const out = scrubPii(input);
    expect(out).not.toContain("maria.lopez@example.mx");
    expect(out).not.toContain("1234 5678");
    expect(out).not.toContain("abc.def-123");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out).not.toContain("Maria");
    expect(out).toContain("[email]");
    expect(out).toContain("[number]");
    expect(out).toContain("https://pwa.neosleepcare.com/leads");
  });

  it("keeps ordinary diagnostic text readable", () => {
    expect(scrubPii("HTTP 500 on /api/v1/organization")).toBe("HTTP 500 on /api/v1/organization");
  });
});

describe("buildDiagnosticPayload", () => {
  it("carries class, status, code, request id and path — never a query string or PII", () => {
    const err = new ApiError({
      kind: "server",
      message: "Duplicate email jan.kowalski@example.pl",
      status: 500,
      code: "DB_ERROR",
      requestId: "3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47",
      path: "/api/v1/lead?search=Jan%20Kowalski&phone=600123456",
      method: "GET",
    });
    const payload = buildDiagnosticPayload(err, {
      where: "LeadsView.load",
      extra: { form_type: "patient", note: "call +48 600 123 456" },
    });
    expect(payload).toMatchObject({
      level: "error",
      source: "frontend",
      request_id: "3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47",
      metadata: {
        where: "LeadsView.load",
        app: "web",
        app_version: "1.2.3",
        kind: "server",
        status: 500,
        code: "DB_ERROR",
        path: "/api/v1/lead",
        method: "GET",
        x_form_type: "patient",
      },
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("jan.kowalski@example.pl");
    expect(serialized).not.toContain("Kowalski");
    expect(serialized).not.toContain("600123456");
    expect(serialized).not.toContain("600 123 456");
  });

  it("offline/timeout errors are reported as warnings, everything else as errors", () => {
    expect(buildDiagnosticPayload(new ApiError({ kind: "network", message: "Failed to fetch" }), { where: "x" }).level).toBe("warn");
    expect(buildDiagnosticPayload(new ApiError({ kind: "timeout", message: "t" }), { where: "x" }).level).toBe("warn");
    expect(buildDiagnosticPayload(new Error("bug"), { where: "x" }).level).toBe("error");
    expect(buildDiagnosticPayload(new Error("bug"), { where: "x", level: "warn" }).level).toBe("warn");
  });
});

describe("reportCaught", () => {
  it("logs to the console with context and POSTs to /api/v1/diagnostics", () => {
    reportCaught(new Error("Maps script failed"), { where: "web.FindSpecialistView.loadMap" });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain("web.FindSpecialistView.loadMap");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example/api/v1/diagnostics");
    expect(init).toMatchObject({ method: "POST", credentials: "omit", keepalive: true });
    expect(sentPayload()).toMatchObject({
      level: "error",
      source: "frontend",
      message: "[web.FindSpecialistView.loadMap] Error: Maps script failed",
    });
  });

  it("dedupes the same error from the same place within 5 s", () => {
    vi.useFakeTimers();
    try {
      reportCaught(new Error("same"), { where: "a" });
      reportCaught(new Error("same"), { where: "a" });
      reportCaught(new Error("same"), { where: "b" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(5001);
      reportCaught(new Error("same"), { where: "a" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      // Every occurrence still reaches the console.
      expect(console.error).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not try to send while the device is offline, but still logs", () => {
    vi.stubGlobal("navigator", { onLine: false });
    reportCaught(new ApiError({ kind: "network", message: "Failed to fetch" }), { where: "x" });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws, even if sending blows up synchronously", () => {
    fetchMock.mockImplementation(() => {
      throw new Error("fetch exploded");
    });
    expect(() => reportCaught(new Error("x"), { where: "y" })).not.toThrow();
  });

  it("only logs when reporting is not configured", () => {
    resetErrorReportingForTests();
    reportCaught(new Error("early"), { where: "boot" });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reportFailedResponse", () => {
  it("builds the typed error from the Response, reports it and returns it", async () => {
    const res = new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "X-Request-ID": "req-42" },
    });
    const err = await reportFailedResponse(res, { where: "HCODetailView.load", path: "/api/v1/organization/:id" });
    expect(err).toMatchObject({ kind: "server", status: 500, requestId: "req-42", path: "/api/v1/organization/:id" });
    expect(sentPayload()).toMatchObject({ request_id: "req-42", metadata: { kind: "server", status: 500 } });
  });
});

describe("installGlobalErrorHandlers", () => {
  it("routes Vue errors to reportCaught with the lifecycle hook and component name", () => {
    const app: { config: { errorHandler?: (err: unknown, instance: never, info: string) => void } } = { config: {} };
    installGlobalErrorHandlers(app);
    const instance = { $options: { __name: "FindSpecialistView" } } as never;
    app.config.errorHandler?.(new Error("render failed"), instance, "render function");
    expect(sentPayload()).toMatchObject({
      message: "[vue:render function] Error: render failed",
      metadata: { where: "vue:render function", x_component: "FindSpecialistView" },
    });
  });
});
