import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "./middleware/errorHandler.js";
import {
  getOrCreateUserByProvider,
  getStaffUserByEmail,
  setUserPassword,
  createPasswordResetToken,
  getPasswordResetUserIdByHash,
  deletePasswordResetTokenByHash,
  insertStaffUser,
  getUserIdByEmail,
  getUserById,
} from "./db.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
const sessionSecret = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";
/** OAuth redirect_uri: use frontend when proxied (dev) so cookie is set for frontend origin. */
const oauthRedirectOrigin = process.env.OAUTH_REDIRECT_ORIGIN ?? frontendUrl;

/** Default password for admin@neosleep.com when created (user must change on first login). */
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD ?? "ChangeMe1!";

const REMEMBER_ME_COOKIE = "remember_me";
const REMEMBER_ME_MAX_AGE_DAYS = 30;
const REMEMBER_ME_MAX_AGE_MS = REMEMBER_ME_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 10;

/** SHA-256 hash for password reset tokens. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** HMAC-SHA256 signature for remember-me cookies (userId:version). */
function signRememberMe(userId: string, version: number): string {
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(`${userId}:${version}`)
    .digest("hex");
}

export const authRouter = Router();

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      name?: string;
      picture?: string;
      role: "admin" | "manager" | "rep";
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

/** Ensure admin@neosleep.com exists with default password (call after initDb). */
export async function ensureStaffAdmin(): Promise<void> {
  const existing = await getUserIdByEmail("admin@neosleep.com");
  if (existing) return;
  const hash = await bcrypt.hash(ADMIN_DEFAULT_PASSWORD, BCRYPT_ROUNDS);
  const user = await insertStaffUser(
    "admin@neosleep.com",
    "Admin",
    "admin",
    hash,
    true
  );
  if (user) {
    console.log("[auth] Created admin@neosleep.com (change password on first login).");
  }
}

// ---------------------------------------------------------------------------
// Session: restore from remember-me cookie if no session
// ---------------------------------------------------------------------------

/** Middleware: if no session but valid remember_me cookie, restore session. */
async function restoreSessionFromRememberMe(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (req.session?.user) { next(); return; }
  const cookie = req.cookies?.[REMEMBER_ME_COOKIE];
  if (!cookie || typeof cookie !== "string") { next(); return; }
  const [userId, versionStr, hmac] = cookie.split(":");
  const version = parseInt(versionStr ?? "", 10);
  if (!userId || !hmac || isNaN(version)) { next(); return; }
  const expected = signRememberMe(userId, version);
  if (!crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"))) { next(); return; }
  try {
    const user = await getUserById(userId);
    if (!user || user.token_version !== version) { next(); return; }
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
      forcePasswordChange: false,
    };
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
  restoreSessionFromRememberMe,
  asyncHandler(async (req: Request, res: Response) => {
    if (req.session?.user) {
      const force = (req.session.user as { forcePasswordChange?: boolean }).forcePasswordChange;
      return res.status(200).json({
        user: req.session.user,
        forcePasswordChange: force ?? false,
      });
    }
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
    const staff = await getStaffUserByEmail(emailStr);
    if (!staff?.password_hash) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const match = await bcrypt.compare(passwordStr, staff.password_hash);
    if (!match) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    (req.session as Express.Session).user = {
      id: staff.id,
      email: staff.email,
      name: staff.name ?? undefined,
      role: staff.role,
      forcePasswordChange: staff.force_password_change,
    };
    if (remember_me === true) {
      const hmac = signRememberMe(staff.id, staff.token_version);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie(REMEMBER_ME_COOKIE, `${staff.id}:${staff.token_version}:${hmac}`, {
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
// GET /auth/session (also restore from remember_me)
// ---------------------------------------------------------------------------

authRouter.get(
  "/auth/session",
  restoreSessionFromRememberMe,
  (req: Request, res: Response) => {
    if (!req.session?.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const u = req.session.user as { forcePasswordChange?: boolean };
    res.json({
      user: {
        id: req.session.user.id,
        email: req.session.user.email,
        name: req.session.user.name,
        picture: req.session.user.picture,
        role: req.session.user.role,
        forcePasswordChange: u.forcePasswordChange ?? false,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /auth/logout (clear session and remember_me cookie)
// ---------------------------------------------------------------------------

authRouter.post("/auth/logout", (req: Request, res: Response) => {
  res.clearCookie(REMEMBER_ME_COOKIE, { path: "/" });
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.status(204).end();
  });
});

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
  const staff = await getStaffUserByEmail(req.session.user.email);
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
  await setUserPassword(req.session.user.id, hash);
  (req.session.user as { forcePasswordChange?: boolean }).forcePasswordChange = false;
  res.status(200).json({ success: true });
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
  const userId = await getUserIdByEmail(emailStr);
  if (!userId) {
    res.status(200).json({ message: "If an account exists, you will receive an email." });
    return;
  }
  const staff = await getStaffUserByEmail(emailStr);
  if (!staff?.password_hash) {
    res.status(200).json({ message: "If an account exists, you will receive an email." });
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
  await createPasswordResetToken(userId, tokenHash, expiresAt);
  const resetLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
  console.log("[auth] Password reset link for", emailStr, ":", resetLink);
  res.status(200).json({
    message: "If an account exists, you will receive an email.",
    devResetLink: process.env.NODE_ENV !== "production" ? resetLink : undefined,
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
  const userId = await getPasswordResetUserIdByHash(tokenHash);
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
  const userId = await getPasswordResetUserIdByHash(tokenHash);
  if (!userId) {
    res.status(400).json({ error: "Invalid or expired reset link. Request a new one." });
    return;
  }
  const hash = await bcrypt.hash(newStr, BCRYPT_ROUNDS);
  await setUserPassword(userId, hash);
  await deletePasswordResetTokenByHash(tokenHash);
  res.status(200).json({ success: true });
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
  const redirectUri = `${oauthRedirectOrigin}/auth/google/callback`;
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
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
    return;
  }
  delete req.session.state;

  if (!clientId || !clientSecret) {
    res.redirect(`${frontendUrl}/login?error=server_config`);
    return;
  }

  const redirectUri = `${oauthRedirectOrigin}/auth/google/callback`;
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
    res.redirect(`${frontendUrl}/login?error=token_exchange`);
    return;
  }

  const tokens = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokens.access_token;
  if (!accessToken) {
    res.redirect(`${frontendUrl}/login?error=no_token`);
    return;
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    res.redirect(`${frontendUrl}/login?error=userinfo`);
    return;
  }

  const userInfo = (await userRes.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  const email = userInfo.email ?? "";
  const dbUser = await getOrCreateUserByProvider("google", userInfo.sub, email, userInfo.name);
  if (dbUser) {
    req.session.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name ?? undefined,
      picture: userInfo.picture,
      role: dbUser.role,
    };
  } else {
    req.session.user = {
      id: userInfo.sub,
      email,
      name: userInfo.name,
      picture: userInfo.picture,
      role: "rep",
    };
  }

  res.redirect(`${frontendUrl}/login?from=google`);
}));
