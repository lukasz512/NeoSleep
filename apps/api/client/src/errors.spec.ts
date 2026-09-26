import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ApiError,
  apiErrorFromResponse,
  classifyStatus,
  isOfflineError,
  readJson,
  toApiError,
} from "./errors";
import { createApiFetch } from "./index";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyStatus", () => {
  it.each([
    [400, "client"],
    [401, "client"],
    [404, "client"],
    [409, "client"],
    [429, "rate_limited"],
    [500, "server"],
    [502, "server"],
    [503, "server"],
  ] as const)("%i -> %s", (status, kind) => {
    expect(classifyStatus(status)).toBe(kind);
  });
});

describe("toApiError", () => {
  it("fetch's TypeError is a network error (Chrome, Firefox and Safari wording)", () => {
    for (const msg of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
      const err = toApiError(new TypeError(msg), { path: "/api/v1/x?search=Jan", method: "GET" });
      expect(err.kind).toBe("network");
      expect(err.isOffline).toBe(true);
      expect(err.path).toBe("/api/v1/x"); // query string (possible PII) dropped
    }
  });

  it("a TypeError from a code bug is NOT mistaken for offline", () => {
    const err = toApiError(new TypeError("Cannot read properties of undefined (reading 'items')"));
    expect(err.kind).toBe("bad_response");
    expect(isOfflineError(err)).toBe(false);
  });

  it("AbortError / TimeoutError is a timeout", () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const timeout = new DOMException("signal timed out", "TimeoutError");
    expect(toApiError(abort).kind).toBe("timeout");
    expect(toApiError(timeout).kind).toBe("timeout");
    expect(isOfflineError(toApiError(timeout))).toBe(true);
  });

  it("a SyntaxError from res.json() is a bad response", () => {
    expect(toApiError(new SyntaxError("Unexpected token '<'")).kind).toBe("bad_response");
  });

  it("passes an ApiError through unchanged", () => {
    const original = new ApiError({ kind: "server", message: "boom", status: 500 });
    expect(toApiError(original)).toBe(original);
  });
});

describe("apiErrorFromResponse", () => {
  it("reads status, message, API code and X-Request-ID, without consuming the body", async () => {
    const res = jsonResponse(409, { error: "Document version is stale", code: "DOCUMENT_VERSION_STALE" }, {
      "X-Request-ID": "3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47",
    });
    const err = await apiErrorFromResponse(res, { path: "/api/v1/invite/accept", method: "POST" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      kind: "client",
      status: 409,
      code: "DOCUMENT_VERSION_STALE",
      requestId: "3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47",
      path: "/api/v1/invite/accept",
      method: "POST",
      message: "Document version is stale",
    });
    // The caller can still read the body.
    await expect(res.json()).resolves.toMatchObject({ code: "DOCUMENT_VERSION_STALE" });
  });

  it("never surfaces an HTML error page as the message", async () => {
    const res = new Response("<!doctype html><h1>502 Bad Gateway</h1>", { status: 502, statusText: "Bad Gateway" });
    const err = await apiErrorFromResponse(res);
    expect(err.kind).toBe("server");
    expect(err.message).toBe("Bad Gateway");
  });
});

describe("readJson", () => {
  it("returns parsed JSON for a 2xx", async () => {
    await expect(readJson<{ ok: number }>(jsonResponse(200, { ok: 1 }))).resolves.toEqual({ ok: 1 });
  });

  it("throws a classified ApiError for a non-2xx", async () => {
    await expect(readJson(jsonResponse(503, { error: "down" }))).rejects.toMatchObject({ kind: "server", status: 503 });
    await expect(readJson(jsonResponse(429, { error: "slow down" }))).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("a 200 carrying the SPA's index.html (missing API base URL) is a bad_response, not silence", async () => {
    const res = new Response("<!doctype html><html><body><div id=app></div></body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
    const err = await readJson(res, { path: "/api/v1/public/specialists" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: "bad_response", status: 200, path: "/api/v1/public/specialists" });
    expect((err as ApiError).message).toContain("Expected JSON but got HTML");
  });
});

describe("createApiFetch", () => {
  it("rejects with a typed network ApiError when fetch itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const apiFetch = createApiFetch({
      getApiBase: () => "https://api.example",
      fetchFn: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const err = await apiFetch("/api/v1/lead?search=Maria").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: "network", path: "/api/v1/lead", method: "GET" });
    // The console line never includes the query string.
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).not.toContain("Maria");
  });

  it("still resolves with the Response on HTTP errors and passes code + request id to onError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = vi.fn();
    const apiFetch = createApiFetch({
      getApiBase: () => "",
      onError,
      fetchFn: async () =>
        jsonResponse(500, { error: "Internal server error", code: "DB_ERROR" }, { "X-Request-ID": "req-1" }),
    });
    const res = await apiFetch("/api/v1/organization", { errorMessageKey: "user.hco.errorLoad" });
    expect(res.status).toBe(500);
    expect(onError).toHaveBeenCalledWith("/api/v1/organization", 500, "Internal server error", "user.hco.errorLoad", {
      code: "DB_ERROR",
      requestId: "req-1",
      method: "GET",
      field: null,
    });
  });

  it("passes the field a 400 names to onError (NEO-109)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = vi.fn();
    const apiFetch = createApiFetch({
      getApiBase: () => "",
      onError,
      fetchFn: async () =>
        jsonResponse(400, { error: "date_of_birth is out of range", code: "VALIDATION_ERROR", field: "date_of_birth" }),
    });
    await apiFetch("/api/v1/patient", { method: "POST" });
    expect(onError.mock.calls[0]?.[4]).toMatchObject({ code: "VALIDATION_ERROR", field: "date_of_birth" });
  });

  it("does not wrap a non-transport error thrown by a custom fetchFn", async () => {
    const bug = new RangeError("bug in interceptor");
    const apiFetch = createApiFetch({ getApiBase: () => "", fetchFn: () => Promise.reject(bug) });
    await expect(apiFetch("/x")).rejects.toBe(bug);
  });
});
