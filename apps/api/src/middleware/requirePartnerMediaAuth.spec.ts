import type { NextFunction, Request, Response } from "express";
import { describe, it, expect, vi } from "vitest";
import { requirePartnerMediaAuth, requireAuth } from "./requireAuth.js";
import { signAuthToken, signMediaToken } from "../utils/jwt.js";

/**
 * The media token rides in a URL (`<video src>` can't send headers), so it
 * must open the partner media route and nothing else — and a login must
 * keep working there too.
 */
function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  { bearer, t }: { bearer?: string; t?: string }
) {
  const req = { headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, query: t ? { t } : {} } as unknown as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn();
  middleware(req, res, next);
  return { passed: next.mock.calls.length === 1, status: vi.mocked(res.status).mock.calls[0]?.[0] };
}

const accessToken = signAuthToken({ id: "u1", email: "rep@example.com", role: "rep", token_version: 0 });
const mediaToken = signMediaToken("u1");

describe("requirePartnerMediaAuth", () => {
  it("accepts a media token in ?t= (what the <video> player sends)", () => {
    expect(run(requirePartnerMediaAuth, { t: mediaToken }).passed).toBe(true);
  });

  it("still accepts a normal Bearer login", () => {
    expect(run(requirePartnerMediaAuth, { bearer: accessToken }).passed).toBe(true);
  });

  it("401s with no token, a garbage token, or an access token smuggled into ?t=", () => {
    expect(run(requirePartnerMediaAuth, {}).status).toBe(401);
    expect(run(requirePartnerMediaAuth, { t: "nope" }).status).toBe(401);
    expect(run(requirePartnerMediaAuth, { t: accessToken }).status).toBe(401);
  });
});

describe("requireAuth", () => {
  it("never accepts a media token as a login", () => {
    expect(run(requireAuth, { bearer: mediaToken }).status).toBe(401);
  });
});
