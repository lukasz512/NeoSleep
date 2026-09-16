import jwt from "jsonwebtoken";
import type { Request } from "express";
import { JWT_SECRET } from "../env.js";
import type { StaffRole } from "../db/users.js";

const ALGORITHM = "HS256";

/** Short on purpose (ADR-020): the access token carries no server-side revocation check
 *  (requireAuth stays DB-free — see its own doc comment), so its blast radius if stolen
 *  is bounded by how soon it expires, not by a revocation list. Session longevity now
 *  lives entirely in the refresh token (see refreshTokenExpiryDate below), which IS
 *  revocable because every use is checked against remember_me_tokens in the DB. */
const ACCESS_TOKEN_EXPIRY = "15m";

/** Refresh token DB-row lifetime — mirrors the old access-token expiry windows (today's
 *  session-cookie-era maxAge / remember-me window), just moved to the token that's
 *  actually capable of being revoked. */
const REFRESH_TOKEN_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_REMEMBER_ME_MS = 30 * 24 * 60 * 60 * 1000;

export function refreshTokenExpiryDate(rememberMe: boolean): Date {
  return new Date(Date.now() + (rememberMe ? REFRESH_TOKEN_REMEMBER_ME_MS : REFRESH_TOKEN_DEFAULT_MS));
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  role: StaffRole;
  country_code?: string;
  region?: string;
  language?: string;
  forcePasswordChange?: boolean;
  /** Compared against users.token_version in TenantContext.buildContext() — bumping the DB
   *  column (incrementUserTokenVersion) invalidates every outstanding token for that user,
   *  e.g. on password change. Not checked here or in requireAuth — see buildContext's doc
   *  comment for why that split is intentional (fast, DB-free edge check vs. the real check
   *  where a tenant DB client is already open). */
  tokenVersion: number;
  iat: number;
  exp: number;
}

export interface SignableUser {
  id: string;
  email: string;
  name?: string | null;
  picture?: string;
  role: StaffRole;
  country_code?: string | null;
  region?: string | null;
  language?: string | null;
  forcePasswordChange?: boolean;
  token_version: number;
}

/** Always ACCESS_TOKEN_EXPIRY regardless of remember-me — see refreshTokenExpiryDate()
 *  for where "remember me" now actually applies. */
export function signAuthToken(user: SignableUser): string {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name ?? undefined,
    picture: user.picture,
    role: user.role,
    country_code: user.country_code ?? undefined,
    region: user.region ?? undefined,
    language: user.language ?? undefined,
    forcePasswordChange: user.forcePasswordChange ?? false,
    tokenVersion: user.token_version,
  };
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

/** Throws (jsonwebtoken's TokenExpiredError/JsonWebTokenError) on missing/invalid/expired/tampered tokens. */
export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: [ALGORITHM] }) as AuthTokenPayload;
}

/** Parses `Authorization: Bearer <token>` — case-insensitive scheme, single space. */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

/** verify-or-null — for routes that attribute to a user when present but allow anonymous access. */
export function getOptionalUser(req: Request): AuthTokenPayload | null {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}
