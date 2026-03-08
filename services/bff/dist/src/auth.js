import { Router } from "express";
import crypto from "node:crypto";
import { getOrCreateUserByProvider } from "./db.js";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
const bffOrigin = process.env.BFF_ORIGIN ?? "http://localhost:3000";
export const authRouter = Router();
authRouter.get("/auth/google", (req, res) => {
    if (!clientId) {
        res.status(503).json({ error: "Google login not configured (GOOGLE_CLIENT_ID)" });
        return;
    }
    const state = crypto.randomBytes(24).toString("hex");
    req.session.state = state;
    const redirectUri = `${bffOrigin}/auth/google/callback`;
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
authRouter.get("/auth/google/callback", async (req, res) => {
    const { code, state } = req.query;
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
    const redirectUri = `${bffOrigin}/auth/google/callback`;
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
    const tokens = (await tokenRes.json());
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
    const userInfo = (await userRes.json());
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
    }
    else {
        req.session.user = {
            id: userInfo.sub,
            email,
            name: userInfo.name,
            picture: userInfo.picture,
            role: "rep",
        };
    }
    res.redirect(`${frontendUrl}/login?from=google`);
});
authRouter.get("/auth/session", (req, res) => {
    if (!req.session?.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    res.json({ user: req.session.user });
});
authRouter.post("/auth/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).json({ error: "Logout failed" });
            return;
        }
        res.status(204).end();
    });
});
