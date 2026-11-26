import type { AuthTokenPayload } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth/requireRole after verifying the Authorization: Bearer token. */
      user?: AuthTokenPayload;
    }
  }
}

export {};
