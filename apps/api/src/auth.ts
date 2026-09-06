import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/requireAuth.js";
import {
  withTenant,
  tenantSlugFromHost,
  getOrCreateUserByProvider,
  getStaffUserByEmail,
  setUserPassword,
  createPasswordResetToken,
  getPasswordResetUserIdByHash,
  deletePasswordResetTokenByHash,
  getUserIdByEmail,
  getUserById,
  getUsersWithoutPassword,
  incrementUserTokenVersion,
} from "./db.js";
import { sendPasswordResetEmail } from "./mailer.js";
import { hashToken } from "./utils/hashToken.js";
import { DEFAULT_FRONTEND_ORIGIN, resolveFrontendOrigin } from "./utils/frontendOrigin.js";
import { signAuthToken } from "./utils/jwt.js";
import { signOAuthState, verifyOAuthState, signExchangeCode, verifyExchangeCode } from "./utils/oauthTokens.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
/** OAuth redirect_uri: use frontend when proxied (dev) so cookie is set for frontend origin. */
const oauthRedirectOrigin = process.env.OAUTH_REDIRECT_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN;

/** Initial password set for any seeded staff account with no password yet (user must change on first login). */
const INITIAL_USER_PASSWORD = process.env.INITIAL_USER_PASSWORD ?? "ChangeMe1!";

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 10;

export const authRouter: import('express').Router = Router();

/** Rate limit: 10 login attempts per 15 minutes per IP. */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Set an initial password for any seeded staff account that was never given one
 * (seed migrations insert rows with password_hash NULL — no code path sets it
 * otherwise). Safe on every startup: only touches accounts with no password yet,
 * so it never overwrites a real one once the user has changed it.
 */
export async function ensureInitialUserPasswords(slug: string): Promise<void> {
  await withTenant(slug, async (client) => {
    const pending = await getUsersWithoutPassword(client);
    for (const user of pending) {
      const hash = await bcrypt.hash(INITIAL_USER_PASSWORD, BCRYPT_ROUNDS);
      await setUserPassword(client, user.id, hash, true);
      console.log(`[auth] Set initial password for ${user.email} in ${slug} (change required on first login).`);
    }
  });
}

// ---------------------------------------------------------------------------
// POST /auth/login (email + password, optional remember me)
// ---------------------------------------------------------------------------

authRouter.post(
  "/auth/login",
  loginRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, remember_me } = req.body as {
      email?: string;
      password?: string;
      remember_me?: boolean;
    };
    const emailStr = typeof email === "string" ? email.trim().toLowerCase() : "";
    const passwordStr = typeof password === "string" ? password : "";
    if (!emailStr || !passwordStr) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
    if (passwordStr.length < 8) {
      res.status(400).json({ error: "Invalid email or password." });
      return;
    }
    const slug = tenantSlugFromHost(req.hostname);
    const staff = await withTenant(slug, (client) => getStaffUserByEmail(client, emailStr));
    if (!staff?.password_hash) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const match = await bcrypt.compare(passwordStr, staff.password_hash);
    if (!match) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const token = signAuthToken(staff, { rememberMe: remember_me === true });
    res.status(200).json({
      token,
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name ?? undefined,
        role: staff.role,
        country_code: staff.country_code ?? undefined,
        region: staff.region ?? undefined,
        language: staff.language ?? undefined,
        forcePasswordChange: staff.force_password_change,
      },
      forcePasswordChange: staff.force_password_change,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /auth/session — echoes the bearer token's claims back as { user }.
// Intentionally does NOT re-check token_version against the DB (that's
// buildContext's job, see TenantContext.ts) — requireAuth already validated
// signature+expiry, which is all this endpoint needs.
// ---------------------------------------------------------------------------

authRouter.get(
  "/auth/session",
  requireAuth,
  (req: Request, res: Response) => {
    const user = req.user!;
    res.json({
      user: {
        id: user.sub,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        country_code: user.country_code,
        region: user.region,
        language: user.language,
        forcePasswordChange: user.forcePasswordChange ?? false,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /auth/logout — there is no server-side session to destroy anymore
// (the bearer token is stateless); this just gives the frontend a symmetric
// endpoint to call before it drops the token client-side. Deliberately does
// NOT bump token_version — that would also sign the user out of every other
// device, which "log out this device" should not do.
// ---------------------------------------------------------------------------

authRouter.post("/auth/logout", requireAuth, (_req: Request, res: Response) => {
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /auth/change-password (authenticated; current + new password)
// ---------------------------------------------------------------------------

authRouter.post("/auth/change-password", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const { current_password, new_password } = req.body as {
    current_password?: string;
    new_password?: string;
  };
  const newStr = typeof new_password === "string" ? new_password : "";
  if (newStr.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }
  const slug = tenantSlugFromHost(req.hostname);
  const sessionUser = req.user!;
  // withTenant returns a {status, body} pair instead of calling res.json() itself —
  // it commits the transaction *after* the callback returns, so responding from inside
  // it would race the client's next request against our own COMMIT (see project memory:
  // project_auth_spec_flaky_test.md for the flake class this causes).
  const result = await withTenant(slug, async (client) => {
    const staff = await getStaffUserByEmail(client, sessionUser.email);
    if (!staff?.password_hash) {
      return { status: 400, body: { error: "Password login not set for this account." } } as const;
    }
    const currentStr = typeof current_password === "string" ? current_password : "";
    const match = await bcrypt.compare(currentStr, staff.password_hash);
    if (!match) {
      return { status: 401, body: { error: "Current password is incorrect." } } as const;
    }
    const hash = await bcrypt.hash(newStr, BCRYPT_ROUNDS);
    await setUserPassword(client, staff.id, hash);
    // Invalidates every outstanding token for this user, INCLUDING the one used to make
    // this very request — a real improvement over the old cookie-session behavior, which
    // only killed remember-me tokens on other devices, never the live session itself.
    await incrementUserTokenVersion(client, staff.id);
    return { status: 200, body: { success: true } } as const;
  });
  res.status(result.status).json(result.body);
}));

// ---------------------------------------------------------------------------
// POST /auth/forgot-password (email → create token, send email placeholder)
// ---------------------------------------------------------------------------

authRouter.post("/auth/forgot-password", asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  const emailStr = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!emailStr) {
    res.status(400).json({ error: "Email is required." });
    return;
  }
  const slug = tenantSlugFromHost(req.hostname);
  // Respond only after withTenant's COMMIT — see the change-password handler above for why.
  const result = await withTenant(slug, async (client) => {
    const genericBody = { message: "If an account exists, you will receive an email." } as const;
    const userId = await getUserIdByEmail(client, emailStr);
    if (!userId) {
      return genericBody;
    }
    const staff = await getStaffUserByEmail(client, emailStr);
    if (!staff?.password_hash) {
      return genericBody;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
    await createPasswordResetToken(client, userId, tokenHash, expiresAt);
    // Origin is reliable here — a direct fetch from the frontend that's handling this
    // request, not a redirect landing from elsewhere (contrast with the OAuth callback).
    const resetLink = `${resolveFrontendOrigin(req)}/reset-password?token=${encodeURIComponent(token)}`;
    // Always attempt to send — mailer.ts itself no-ops (with a console warning) if Resend
    // isn't configured, so this is safe locally too. The console log + devResetLink below
    // stay regardless, so local dev works without needing real Resend creds set up.
    sendPasswordResetEmail(emailStr, resetLink, {
      title: staff.salutation,
      firstName: staff.first_name,
      lastName: staff.last_name,
      language: staff.language,
      region: staff.region,
    }).catch((err) => {
      console.error("[auth] Failed to send password reset email:", err);
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[auth] Password reset link for", emailStr, ":", resetLink);
    }
    return {
      ...genericBody,
      devResetLink: process.env.NODE_ENV !== "production" ? resetLink : undefined,
    };
  });
  res.status(200).json(result);
}));

// ---------------------------------------------------------------------------
// GET /auth/reset-password/validate?token= (check if token valid)
// ---------------------------------------------------------------------------

authRouter.get("/auth/reset-password/validate", asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({ valid: false, error: "Token is required." });
    return;
  }
  const tokenHash = hashToken(token);
  const slug = tenantSlugFromHost(req.hostname);
  const userId = await withTenant(slug, (client) => getPasswordResetUserIdByHash(client, tokenHash));
  res.status(200).json({ valid: !!userId });
}));

// ---------------------------------------------------------------------------
// POST /auth/reset-password (token + new_password; single use)
// ---------------------------------------------------------------------------

authRouter.post("/auth/reset-password", asyncHandler(async (req: Request, res: Response) => {
  const { token, new_password } = req.body as { token?: string; new_password?: string };
  const tokenStr = typeof token === "string" ? token : "";
  const newStr = typeof new_password === "string" ? new_password : "";
  if (!tokenStr) {
    res.status(400).json({ error: "Reset token is required." });
    return;
  }
  if (newStr.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }
  const tokenHash = hashToken(tokenStr);
  const slug = tenantSlugFromHost(req.hostname);
  // Respond only after withTenant's COMMIT — see the change-password handler above for why.
  const result = await withTenant(slug, async (client) => {
    const userId = await getPasswordResetUserIdByHash(client, tokenHash);
    if (!userId) {
      return { status: 400, body: { error: "Invalid or expired reset link. Request a new one." } } as const;
    }
    const hash = await bcrypt.hash(newStr, BCRYPT_ROUNDS);
    await setUserPassword(client, userId, hash);
    await deletePasswordResetTokenByHash(client, tokenHash);
    await incrementUserTokenVersion(client, userId);
    return { status: 200, body: { success: true } } as const;
  });
  res.status(result.status).json(result.body);
}));

// ---------------------------------------------------------------------------
// Google OAuth (for portal/doctors; rep-app uses email/password only)
//
// No server-side session exists to stash anything in across the redirect to
// Google and back — the CSRF `state` and the post-callback hand-off are both
// self-contained signed JWTs (utils/oauthTokens.ts) instead. See that file's
// doc comments for why: `state` carries the frontendOrigin claim (Origin is
// only reliable at the point /auth/google is hit, not on the callback, which
// is reached via Google's own redirect); the callback never puts the real
// (7/30-day) auth token in a redirect URL — it mints a narrow, 60-second,
// single-claim exchange code instead, and the frontend immediately exchanges
// that for a real token via POST /auth/google/exchange.
// ---------------------------------------------------------------------------

authRouter.get("/auth/google", (req: Request, res: Response) => {
  if (!clientId) {
    res.status(503).json({ error: "Google login not configured (GOOGLE_CLIENT_ID)" });
    return;
  }
  const state = signOAuthState(resolveFrontendOrigin(req));
  const redirectUri = `${oauthRedirectOrigin}/api/v1/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

authRouter.get("/auth/google/callback", asyncHandler(async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const frontendOrigin = (state ? verifyOAuthState(state) : null) ?? DEFAULT_FRONTEND_ORIGIN;

  if (!code || !state || !verifyOAuthState(state)) {
    res.redirect(`${frontendOrigin}/login?error=auth_failed`);
    return;
  }

  if (!clientId || !clientSecret) {
    res.redirect(`${frontendOrigin}/login?error=server_config`);
    return;
  }

  const redirectUri = `${oauthRedirectOrigin}/api/v1/auth/google/callback`;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Google token error:", tokenRes.status, errText);
    res.redirect(`${frontendOrigin}/login?error=token_exchange`);
    return;
  }

  const tokens = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokens.access_token;
  if (!accessToken) {
    res.redirect(`${frontendOrigin}/login?error=no_token`);
    return;
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    res.redirect(`${frontendOrigin}/login?error=userinfo`);
    return;
  }

  const userInfo = (await userRes.json()) as {
    sub: string;
    email?: string;
    name?: string;
  };
  const email = userInfo.email ?? "";
  const slug = tenantSlugFromHost(req.hostname);
  const dbUser = await withTenant(slug, (client) =>
    getOrCreateUserByProvider(client, "google", userInfo.sub, email, userInfo.name)
  );
  if (!dbUser) {
    res.redirect(`${frontendOrigin}/login?error=account_provision_failed`);
    return;
  }

  const exchangeCode = signExchangeCode(dbUser.id);
  res.redirect(`${frontendOrigin}/auth/callback?code=${encodeURIComponent(exchangeCode)}`);
}));

// ---------------------------------------------------------------------------
// POST /auth/google/exchange — the frontend's /auth/callback view POSTs the
// short-lived exchange code here and gets back a real auth token, same shape
// as /auth/login's response. Re-fetches the user fresh from DB rather than
// trusting anything carried across the redirect, so it naturally picks up
// the current token_version.
// ---------------------------------------------------------------------------

authRouter.post("/auth/google/exchange", asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (typeof code !== "string" || !code) {
    res.status(400).json({ error: "Exchange code is required." });
    return;
  }
  let userId: string;
  try {
    userId = verifyExchangeCode(code);
  } catch {
    res.status(401).json({ error: "Invalid or expired exchange code." });
    return;
  }
  const slug = tenantSlugFromHost(req.hostname);
  const user = await withTenant(slug, (client) => getUserById(client, userId));
  if (!user) {
    res.status(401).json({ error: "Account no longer exists." });
    return;
  }
  const token = signAuthToken(user, { rememberMe: false });
  res.status(200).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
      country_code: user.country_code ?? undefined,
      region: user.region ?? undefined,
      language: user.language ?? undefined,
      forcePasswordChange: false,
    },
    forcePasswordChange: false,
  });
}));
