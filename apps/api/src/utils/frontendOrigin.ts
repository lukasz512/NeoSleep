import type { Request } from "express";
import { FRONTEND_URLS } from "../env.js";

/** FRONTEND_URLS[0] is the "no better match" default — one Render BFF can serve multiple
 * frontends (pwa + pwa-dev), so FRONTEND_URL/_URLS may hold more than one origin. Never
 * interpolate FRONTEND_URL (the raw, possibly comma-separated string) directly into a link
 * or redirect — see resolveFrontendOrigin() below, which picks exactly one. */
export const DEFAULT_FRONTEND_ORIGIN: string = FRONTEND_URLS[0] ?? "http://localhost:5173";

/**
 * Picks the single frontend origin a redirect/link should point back to, out of the
 * (possibly multiple) origins FRONTEND_URL allows — see server.ts's CORS config, which
 * allows the same set. Origin/Referer headers are only reliable for direct
 * fetch/XHR-initiated requests (e.g. POST /auth/forgot-password) — NOT for a browser
 * navigating back after an external redirect (e.g. Google's OAuth callback), where the
 * header reflects the external site's domain or is absent. For that case, capture the
 * origin at the point it IS reliable and thread it through req.session (see auth.ts's
 * /auth/google) or an explicit parameter (see commands that build a link outside a
 * route handler, e.g. ActivatePractitionerCommand) instead of calling this again later.
 */
export function resolveFrontendOrigin(req: Request): string {
  const origin = req.get("origin");
  if (origin && FRONTEND_URLS.includes(origin)) return origin;
  return DEFAULT_FRONTEND_ORIGIN;
}
