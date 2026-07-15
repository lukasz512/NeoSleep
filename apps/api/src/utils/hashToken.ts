import crypto from "node:crypto";

/** SHA-256 hash used for password reset and remember-me token secrets — never store the raw token. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
