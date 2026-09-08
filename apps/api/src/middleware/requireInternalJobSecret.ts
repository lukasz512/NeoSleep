import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { AuthError } from "../errors.js";
import { getBearerToken } from "../utils/jwt.js";
import { INTERNAL_JOB_SECRET } from "../env.js";

/**
 * Constant-time string compare — `!==` short-circuits on the first differing
 * byte, so a naive comparison leaks (via response timing) how many leading
 * characters of a guessed token are correct. timingSafeEqual() throws on
 * mismatched buffer lengths rather than returning false, so length is
 * checked first; that check is itself a (much smaller, standard, and
 * accepted-in-practice) timing leak — an attacker learns the secret's exact
 * length but nothing about its content, which is the common pattern for this
 * kind of comparison.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Gate for machine-to-machine job endpoints (e.g. partner status-sync jobs)
 * called by an external scheduler (Render Cron Job / GitHub Actions
 * schedule), not by a logged-in user — so there's no session/JWT to verify,
 * just a shared secret in the same `Authorization: Bearer <token>` shape
 * every other route already uses (reuses getBearerToken for that reason).
 *
 * Fail-closed: if INTERNAL_JOB_SECRET isn't configured, every request is
 * rejected — never falls back to "no auth required".
 */
export function requireInternalJobSecret(req: Request, _res: Response, next: NextFunction): void {
  const provided = getBearerToken(req);
  if (!INTERNAL_JOB_SECRET || !provided || !timingSafeStringEqual(provided, INTERNAL_JOB_SECRET)) {
    next(new AuthError("Invalid or missing job secret"));
    return;
  }
  next();
}
