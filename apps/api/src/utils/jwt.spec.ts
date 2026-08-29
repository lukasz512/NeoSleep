import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { signAuthToken, verifyAuthToken, getBearerToken, getOptionalUser } from "./jwt.js";
import { JWT_SECRET } from "../env.js";
import type { Request } from "express";

const BASE_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "qa@neosleepcare.com",
  name: "QA Pilot",
  role: "rep" as const,
  country_code: "PL",
  region: "Central",
  language: "pl",
  token_version: 0,
};

function reqWithAuthHeader(header?: string): Request {
  return { headers: header ? { authorization: header } : {} } as unknown as Request;
}

describe("signAuthToken / verifyAuthToken", () => {
  it("round-trips the payload", () => {
    const token = signAuthToken(BASE_USER, { rememberMe: false });
    const decoded = verifyAuthToken(token);
    expect(decoded.sub).toBe(BASE_USER.id);
    expect(decoded.email).toBe(BASE_USER.email);
    expect(decoded.role).toBe(BASE_USER.role);
    expect(decoded.tokenVersion).toBe(0);
  });

  it("expires in ~7 days without remember me", () => {
    const token = signAuthToken(BASE_USER, { rememberMe: false });
    const decoded = verifyAuthToken(token);
    const deltaDays = (decoded.exp - decoded.iat) / (60 * 60 * 24);
    expect(deltaDays).toBeGreaterThan(6.9);
    expect(deltaDays).toBeLessThan(7.1);
  });

  it("expires in ~30 days with remember me", () => {
    const token = signAuthToken(BASE_USER, { rememberMe: true });
    const decoded = verifyAuthToken(token);
    const deltaDays = (decoded.exp - decoded.iat) / (60 * 60 * 24);
    expect(deltaDays).toBeGreaterThan(29.9);
    expect(deltaDays).toBeLessThan(30.1);
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ sub: BASE_USER.id, tokenVersion: 0 }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "-1s",
    });
    expect(() => verifyAuthToken(token)).toThrow();
  });

  it("rejects a token signed with the wrong secret (tampered)", () => {
    const token = jwt.sign({ sub: BASE_USER.id, tokenVersion: 0 }, "wrong-secret", {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    expect(() => verifyAuthToken(token)).toThrow();
  });

  it("rejects an unsigned alg:none token even if otherwise well-formed", () => {
    const token = jwt.sign({ sub: BASE_USER.id, tokenVersion: 0 }, "", {
      algorithm: "none",
      expiresIn: "1h",
    });
    expect(() => verifyAuthToken(token)).toThrow();
  });
});

describe("getBearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(getBearerToken(reqWithAuthHeader("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the Bearer scheme", () => {
    expect(getBearerToken(reqWithAuthHeader("bearer abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("returns null when the header is absent", () => {
    expect(getBearerToken(reqWithAuthHeader())).toBeNull();
  });

  it("returns null for a malformed header (no scheme)", () => {
    expect(getBearerToken(reqWithAuthHeader("abc.def.ghi"))).toBeNull();
  });
});

describe("getOptionalUser", () => {
  it("returns the decoded payload for a valid token", () => {
    const token = signAuthToken(BASE_USER, { rememberMe: false });
    const user = getOptionalUser(reqWithAuthHeader(`Bearer ${token}`));
    expect(user?.sub).toBe(BASE_USER.id);
  });

  it("returns null (never throws) for a missing or invalid token", () => {
    expect(getOptionalUser(reqWithAuthHeader())).toBeNull();
    expect(getOptionalUser(reqWithAuthHeader("Bearer not-a-real-token"))).toBeNull();
  });
});
