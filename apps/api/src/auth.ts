import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "./middleware/errorHandler.js";
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
  createRememberMeToken,
  getRememberMeTokenById,
  touchRememberMeToken,
  revokeRememberMeToken,
  revokeAllRememberMeTokensForUser,
  type StaffRole,
} from "./db.js";
import { sendPasswordResetEmail } from "./mailer.js";
import { FRONTEND_URL } from "./env.js";
import { hashToken } from "./utils/hashToken.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
/** OAuth redirect_uri: use frontend when proxied (dev) so cookie is set for frontend origin. */
const oauthRedirectOrigin = process.env.OAUTH_REDIRECT_ORIGIN ?? FRONTEND_URL;

/** Initial password set for any seeded staff account with no password yet (user must change on first login). */
const INITIAL_USER_PASSWORD = process.env.INITIAL_USER_PASSWORD ?? "ChangeMe1!";

const REMEMBER_ME_COOKIE = "remember_me";
const REMEMBER_ME_MAX_AGE_DAYS = 30;
const REMEMBER_ME_MAX_AGE_MS = REMEMBER_ME_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 10;

export const authRouter: import('express').Router = Router();

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      name?: string;
      picture?: string;
      role: StaffRole;
      country_code?: string;
      region?: string;
      language?: string;
      forcePasswordChange?: boolean;
    };
    state?: string;
  }
}

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
// Session: restore from remember-me cookie if no session
// ---------------------------------------------------------------------------

/**
 * Middleware: if no session but valid remember_me cookie, restore session. Cookie: `<tokenId>.<secret>`; DB stores only sha256(secret).
 * Mounted globally in server.ts (right after the session middleware, before any router) so remember-me
 * silently restores the session on ANY request, not just /auth/login and /auth/session — otherwise a request
 * to a protected route (requireAuth) 401s the moment the 7-day session cookie outlives its usefulness, even
 * though a 30-day remember-me cookie is still valid.
 */
export async function restoreSessionFromRememberMe(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (req.session?.user) { next(); return; }
  const cookie = req.cookies?.[REMEMBER_ME_COOKIE];
  if (!cookie || typeof cookie !== "string") { next(); return; }
  const [tokenId, secret] = cookie.split(".");
  if (!tokenId || !secret) { next(); return; }
  try {
    const slug = tenantSlugFromHost(req.hostname);
    await withTenant(slug, async (client) => {
      const token = await getRememberMeTokenById(client, tokenId);
      if (!token) return;
      const expected = Buffer.from(token.token_hash, "hex");
      const actual = Buffer.from(hashToken(secret), "hex");
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return;
      const user = await getUserById(client, token.user_id);
      if (!user) return;
      req.session.user = {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        role: user.role,
        country_code: user.country_code ?? undefined,
        region: user.region ?? undefined,
        language: user.language ?? undefined,
        forcePasswordChange: false,
      };
      await touchRememberMeToken(client, tokenId);
    });
  } catch {
    // Invalid/expired remember-me — clear it silently
  }
  next();
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
    req.session.user = {
      id: staff.id,
      email: staff.email,
      name: staff.name ?? undefined,
      role: staff.role,
      country_code: staff.country_code ?? undefined,
      region: staff.region ?? undefined,
      language: staff.language ?? undefined,
      forcePasswordChange: staff.force_password_change,
    };
    if (remember_me === true) {
      const secret = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + REMEMBER_ME_MAX_AGE_MS);
      const tokenId = await withTenant(slug, (client) =>
        createRememberMeToken(client, staff.id, hashToken(secret), expiresAt)
      );
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie(REMEMBER_ME_COOKIE, `${tokenId}.${secret}`, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: REMEMBER_ME_MAX_AGE_MS,
        path: "/",
      });
    }
    res.status(200).json({
      user: req.session.user,
      forcePasswordChange: staff.force_password_change,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /auth/session (remember-me restore happens upstream, in server.ts)
// ---------------------------------------------------------------------------

authRouter.get(
  "/auth/session",
  (req: Request, res: Response) => {
    if (!req.session?.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({
      user: {
        id: req.session.user.id,
        email: req.session.user.email,
        name: req.session.user.name,
        picture: req.session.user.picture,
        role: req.session.user.role,
        country_code: req.session.user.country_code,
        region: req.session.user.region,
        language: req.session.user.language,
        forcePasswordChange: req.session.user.forcePasswordChange ?? false,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /auth/logout (clear session and remember_me cookie)
// ---------------------------------------------------------------------------

authRouter.post("/auth/logout", asyncHandler(async (req: Request, res: Response) => {
  const cookie = req.cookies?.[REMEMBER_ME_COOKIE];
  if (typeof cookie === "string") {
    const [tokenId] = cookie.split(".");
    if (tokenId) {
      const slug = tenantSlugFromHost(req.hostname);
      await withTenant(slug, (client) => revokeRememberMeToken(client, tokenId));
    }
  }
  res.clearCookie(REMEMBER_ME_COOKIE, { path: "/" });
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.status(204).end();
  });
}));

// ---------------------------------------------------------------------------
// POST /auth/change-password (authenticated; current + new password)
// ---------------------------------------------------------------------------

authRouter.post("/auth/change-password", asyncHandler(async (req: Request, res: Response) => {
  if (!req.session?.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
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
  const sessionUser = req.session.user;
  await withTenant(slug, async (client) => {
    const staff = await getStaffUserByEmail(client, sessionUser.email);
    if (!staff?.password_hash) {
      res.status(400).json({ error: "Password login not set for this account." });
      return;
    }
    const currentStr = typeof current_password === "string" ? current_password : "";
    const match = await bcrypt.compare(currentStr, staff.password_hash);
    if (!match) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    const hash = await bcrypt.hash(newStr, BCRYPT_ROUNDS);
    await setUserPassword(client, sessionUser.id, hash);
    await revokeAllRememberMeTokensForUser(client, sessionUser.id);
    sessionUser.forcePasswordChange = false;
    res.status(200).json({ success: true });
  });
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
  await withTenant(slug, async (client) => {
    const userId = await getUserIdByEmail(client, emailStr);
    if (!userId) {
      res.status(200).json({ message: "If an account exists, you will receive an email." });
      return;
    }
    const staff = await getStaffUserByEmail(client, emailStr);
    if (!staff?.password_hash) {
      res.status(200).json({ message: "If an account exists, you will receive an email." });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
    await createPasswordResetToken(client, userId, tokenHash, expiresAt);
    const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
    // Always attempt to send — mailer.ts itself no-ops (with a console warning) if Gmail
    // isn't configured, so this is safe locally too. The console log + devResetLink below
    // stay regardless, so local dev works without needing real Gmail creds set up.
    sendPasswordResetEmail(emailStr, resetLink, {
      title: staff.title,
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
    res.status(200).json({
      message: "If an account exists, you will receive an email.",
      devResetLink: process.env.NODE_ENV !== "production" ? resetLink : undefined,
    });
  });
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
  await withTenant(slug, async (client) => {
    const userId = await getPasswordResetUserIdByHash(client, tokenHash);
    if (!userId) {
      res.status(400).json({ error: "Invalid or expired reset link. Request a new one." });
      return;
    }
    const hash = await bcrypt.hash(newStr, BCRYPT_ROUNDS);
    await setUserPassword(client, userId, hash);
    await deletePasswordResetTokenByHash(client, tokenHash);
    await revokeAllRememberMeTokensForUser(client, userId);
    res.status(200).json({ success: true });
  });
}));

// ---------------------------------------------------------------------------
// Google OAuth (for portal/doctors; rep-app uses email/password only)
// ---------------------------------------------------------------------------

authRouter.get("/auth/google", (req: Request, res: Response) => {
  if (!clientId) {
    res.status(503).json({ error: "Google login not configured (GOOGLE_CLIENT_ID)" });
    return;
  }
  const state = crypto.randomBytes(24).toString("hex");
  req.session.state = state;
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
  const savedState = req.session.state;

  if (!code || !state || state !== savedState) {
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    return;
  }
  delete req.session.state;

  if (!clientId || !clientSecret) {
    res.redirect(`${FRONTEND_URL}/login?error=server_config`);
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
    res.redirect(`${FRONTEND_URL}/login?error=token_exchange`);
    return;
  }

  const tokens = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokens.access_token;
  if (!accessToken) {
    res.redirect(`${FRONTEND_URL}/login?error=no_token`);
    return;
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    res.redirect(`${FRONTEND_URL}/login?error=userinfo`);
    return;
  }

  const userInfo = (await userRes.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  const email = userInfo.email ?? "";
  const slug = tenantSlugFromHost(req.hostname);
  const dbUser = await withTenant(slug, (client) =>
    getOrCreateUserByProvider(client, "google", userInfo.sub, email, userInfo.name)
  );
  if (!dbUser) {
    res.redirect(`${FRONTEND_URL}/login?error=account_provision_failed`);
    return;
  }

  req.session.user = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? undefined,
    picture: userInfo.picture,
    role: dbUser.role,
    country_code: dbUser.country_code ?? undefined,
    region: dbUser.region ?? undefined,
    language: dbUser.language ?? undefined,
  };

  res.redirect(`${FRONTEND_URL}/login?from=google`);
}));
