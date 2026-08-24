import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../env.js";

const ALGORITHM = "HS256";

/**
 * Google OAuth's CSRF `state` and post-callback "exchange code" used to be stashed in
 * req.session (a real cookie session). Now that auth is bearer-token-only, there is no
 * server-side session to stash anything in across the redirect to Google and back — these
 * are self-contained signed JWTs instead, verified on return without any DB/session lookup.
 */

interface OAuthStatePayload {
  purpose: "oauth_state";
  /** Captured at /auth/google, where Origin is reliable — the callback is reached via a
   *  redirect FROM Google, where Origin/Referer reflect Google's domain or are absent, so it
   *  can't re-derive which frontend to send the user back to on its own (see resolveFrontendOrigin). */
  frontendOrigin: string;
}

interface OAuthExchangePayload {
  purpose: "oauth_exchange";
  sub: string;
}

export function signOAuthState(frontendOrigin: string): string {
  const payload: OAuthStatePayload = { purpose: "oauth_state", frontendOrigin };
  return jwt.sign(payload, JWT_SECRET, { algorithm: ALGORITHM, expiresIn: "5m" });
}

/** Returns the frontendOrigin claim if the state is valid (signature, expiry, purpose), else null. */
export function verifyOAuthState(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [ALGORITHM] }) as OAuthStatePayload;
    return decoded.purpose === "oauth_state" ? decoded.frontendOrigin : null;
  } catch {
    return null;
  }
}

/** Narrow, single-claim, 60s-lived code — never carries the real auth token or profile data,
 *  only enough to look the user back up once the frontend POSTs it to /auth/google/exchange. */
export function signExchangeCode(userId: string): string {
  const payload: OAuthExchangePayload = { purpose: "oauth_exchange", sub: userId };
  return jwt.sign(payload, JWT_SECRET, { algorithm: ALGORITHM, expiresIn: "60s" });
}

/** Throws on invalid/expired/tampered/wrong-purpose codes. */
export function verifyExchangeCode(token: string): string {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [ALGORITHM] }) as OAuthExchangePayload;
  if (decoded.purpose !== "oauth_exchange") throw new Error("Invalid exchange code");
  return decoded.sub;
}
