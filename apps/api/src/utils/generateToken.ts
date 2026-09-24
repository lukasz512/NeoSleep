import crypto from "node:crypto";

/**
 * 256-bit URL-safe random secret for single-use links (store only its
 * hashToken() digest, never the raw value). base64url rather than hex keeps
 * the URL — and therefore the QR code encoding it — shorter and less dense.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
