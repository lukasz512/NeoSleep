import { describe, it, expect } from "vitest";
import { ApiError, type ApiErrorKind } from "./errors";
import { describeErrorInline, errorBodyKeyOr, errorClassOf, errorMessageKeys, messageKeyForCode, shortRequestId } from "./errorMessage";
import en from "../../../../packages/i18n/en.json";
import pl from "../../../../packages/i18n/pl.json";
import mx from "../../../../packages/i18n/mx.json";

function apiError(kind: ApiErrorKind, status: number | null = null, requestId: string | null = null): ApiError {
  return new ApiError({ kind, message: "x", status, requestId });
}

describe("errorClassOf — which message the user sees", () => {
  it.each([
    [apiError("network"), "network"],
    [apiError("timeout"), "timeout"],
    [apiError("server", 500), "server"],
    [apiError("bad_response", 200), "server"],
    [apiError("rate_limited", 429), "rateLimited"],
    [apiError("client", 404), "notFound"],
    [apiError("client", 410), "notFound"],
    [apiError("client", 401), "forbidden"],
    [apiError("client", 403), "forbidden"],
    [apiError("client", 400), "invalid"],
    [apiError("client", 422), "invalid"],
    [new Error("bug"), "unexpected"],
    ["a string", "unexpected"],
  ] as const)("%o -> %s", (err, cls) => {
    expect(errorClassOf(err)).toBe(cls);
  });

  it("a server error is never described as a connection problem", () => {
    expect(errorMessageKeys(apiError("server", 500)).title).toBe("common.error.server.title");
    expect(errorMessageKeys(apiError("server", 500)).title).not.toContain("network");
  });
});

describe("errorMessageKeys", () => {
  it("adds a short support reference only for failures on our side", () => {
    const id = "3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47";
    expect(errorMessageKeys(apiError("server", 500, id)).reference).toBe("3f2a9c1e");
    expect(errorMessageKeys(apiError("network", null, id)).reference).toBeNull();
    expect(errorMessageKeys(apiError("client", 404, id)).reference).toBeNull();
  });

  it("every key it can produce exists in en, pl and mx", () => {
    const classes = ["network", "timeout", "server", "notFound", "forbidden", "invalid", "rateLimited", "unexpected"];
    const keys = classes.flatMap((c) => [`common.error.${c}.title`, `common.error.${c}.body`]).concat("common.error.reference");
    for (const dict of [en, pl, mx] as Record<string, string>[]) {
      for (const key of keys) expect(dict[key], key).toBeTruthy();
    }
  });
});

describe("errorBodyKeyOr", () => {
  it("prefers the class body for connection/server/rate-limit, else keeps the form's own key", () => {
    expect(errorBodyKeyOr(apiError("network"), "user.login.error.network")).toBe("common.error.network.body");
    expect(errorBodyKeyOr(apiError("server", 500), "user.login.error.network")).toBe("common.error.server.body");
    expect(errorBodyKeyOr(apiError("rate_limited", 429), "f")).toBe("common.error.rateLimited.body");
    expect(errorBodyKeyOr(apiError("client", 400), "f")).toBe("f");
    expect(errorBodyKeyOr(new Error("bug"), "f")).toBe("f");
  });
});

describe("describeErrorInline", () => {
  it("renders title, body and reference with the given translator", () => {
    const t = (key: string, params?: Record<string, unknown>) =>
      (en as Record<string, string>)[key]!.replace("{id}", String(params?.id ?? ""));
    const text = describeErrorInline(apiError("server", 503, "abcd1234-0000"), t);
    expect(text).toBe(
      "Something went wrong on our side. It's not your connection. We've been notified — try again in a moment. Reference: abcd1234",
    );
  });
});

describe("shortRequestId", () => {
  it("returns the first UUID block, or null", () => {
    expect(shortRequestId("3f2a9c1e-7b4d-4e21")).toBe("3f2a9c1e");
    expect(shortRequestId("edge-abc")).toBe("edge");
    expect(shortRequestId(null)).toBeNull();
    expect(shortRequestId("")).toBeNull();
  });
});

describe("messageKeyForCode", () => {
  it("maps EMAIL_IN_USE to a key present in every language (NEO-111)", () => {
    const key = messageKeyForCode("EMAIL_IN_USE");
    expect(key).toBe("common.error.emailInUse");
    for (const dict of [en, pl, mx] as Record<string, string>[]) expect(dict[key!]).toBeTruthy();
  });

  it("returns null for codes without a dedicated message", () => {
    expect(messageKeyForCode("CONFLICT")).toBeNull();
    expect(messageKeyForCode(null)).toBeNull();
    expect(messageKeyForCode(undefined)).toBeNull();
  });
});
