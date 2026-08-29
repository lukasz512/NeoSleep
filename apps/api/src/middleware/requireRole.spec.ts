import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireRole } from "./requireRole.js";
import { AuthError, ForbiddenError } from "../errors.js";
import { signAuthToken } from "../utils/jwt.js";

function tokenFor(role: string): string {
  return signAuthToken(
    { id: "u1", email: "qa@neosleepcare.com", role: role as never, token_version: 0 },
    { rememberMe: false },
  );
}

function makeReq(role?: string): Request {
  const headers: Record<string, string> = role ? { authorization: `Bearer ${tokenFor(role)}` } : {};
  return { headers } as unknown as Request;
}

describe("requireRole", () => {
  it("no token → next(AuthError) (401)", () => {
    const next = vi.fn() as NextFunction;
    requireRole("admin")(makeReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(AuthError));
  });

  it("wrong role → next(ForbiddenError) (403)", () => {
    const next = vi.fn() as NextFunction;
    requireRole("admin")(makeReq("rep"), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("correct role → next() with no error", () => {
    const next = vi.fn() as NextFunction;
    requireRole("admin")(makeReq("admin"), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("accepts any of multiple allowed roles", () => {
    const next = vi.fn() as NextFunction;
    requireRole("admin", "manager")(makeReq("manager"), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("reuses req.user when requireAuth already verified it (doesn't re-verify)", () => {
    const next = vi.fn() as NextFunction;
    const req = { headers: {}, user: { sub: "u1", email: "qa@neosleepcare.com", role: "admin", tokenVersion: 0 } } as unknown as Request;
    requireRole("admin")(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
