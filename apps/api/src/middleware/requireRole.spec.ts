import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireRole } from "./requireRole.js";
import { AuthError, ForbiddenError } from "../errors.js";

function makeReq(role?: string): Request {
  return { session: role ? { user: { role } } : {} } as unknown as Request;
}

describe("requireRole", () => {
  it("no session → next(AuthError) (401)", () => {
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
});
