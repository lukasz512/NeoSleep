import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

// AuthError is asserted structurally (code/statusCode) rather than via
// `instanceof AuthError` — vi.resetModules() below gives the freshly
// re-imported middleware its own module graph, so a class statically
// imported here beforehand would fail `instanceof` against it despite being
// "the same" class by name and shape.
const AUTH_ERROR_SHAPE = { name: "AppError", code: "AUTH_ERROR", statusCode: 401 };

async function importMiddleware(configuredSecret: string | undefined) {
  vi.doMock("../env.js", () => ({ INTERNAL_JOB_SECRET: configuredSecret }));
  vi.resetModules();
  return import("./requireInternalJobSecret.js");
}

function makeReq(authorization?: string): Request {
  return { headers: authorization ? { authorization } : {} } as unknown as Request;
}

describe("requireInternalJobSecret", () => {
  it("rejects when no secret is configured at all (fail-closed, not open)", async () => {
    const { requireInternalJobSecret } = await importMiddleware(undefined);
    const next = vi.fn() as NextFunction;
    requireInternalJobSecret(makeReq("Bearer anything"), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining(AUTH_ERROR_SHAPE));
  });

  it("rejects a missing Authorization header", async () => {
    const { requireInternalJobSecret } = await importMiddleware("correct-secret");
    const next = vi.fn() as NextFunction;
    requireInternalJobSecret(makeReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining(AUTH_ERROR_SHAPE));
  });

  it("rejects a wrong secret", async () => {
    const { requireInternalJobSecret } = await importMiddleware("correct-secret");
    const next = vi.fn() as NextFunction;
    requireInternalJobSecret(makeReq("Bearer wrong-secret"), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining(AUTH_ERROR_SHAPE));
  });

  // Same length as the configured secret — exercises the timingSafeEqual()
  // byte comparison itself, not just the length-mismatch short-circuit above
  // ("wrong-secret" vs "correct-secret" differ in length; this doesn't).
  it("rejects a same-length wrong secret", async () => {
    const { requireInternalJobSecret } = await importMiddleware("correct-secret");
    const next = vi.fn() as NextFunction;
    requireInternalJobSecret(makeReq("Bearer korrect-secret"), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining(AUTH_ERROR_SHAPE));
  });

  it("accepts the correct secret", async () => {
    const { requireInternalJobSecret } = await importMiddleware("correct-secret");
    const next = vi.fn() as NextFunction;
    requireInternalJobSecret(makeReq("Bearer correct-secret"), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
