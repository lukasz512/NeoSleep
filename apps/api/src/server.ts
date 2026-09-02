import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { FRONTEND_URLS } from "./env.js";
import { authRouter, ensureInitialUserPasswords } from "./auth.js";
import { leadsRouter } from "./routes/leads.js";
import { practitionerRouter } from "./routes/practitioner.js";
import { organizationRouter } from "./routes/organization.js";
import { presentationRouter } from "./routes/presentation.js";
import { diagnosticsRouter } from "./routes/diagnostics.js";
import { encounterRouter } from "./routes/encounter.js";
import { configRouter } from "./routes/config.js";
import { lookupRouter } from "./routes/lookup.js";
import { websiteContactRouter } from "./routes/website-contact.js";
import { bookingRouter } from "./routes/booking.js";
import { publicRouter } from "./routes/public.js";
import { patientRouter } from "./routes/patient.js";
import { pushRouter } from "./routes/push.js";
import { usersRouter } from "./routes/users.js";
import { inviteRouter } from "./routes/invite.js";
import { notificationRouter } from "./routes/notification.js";
import { orthoapneaResourcesRouter } from "./routes/partners/orthoapnea-resources.js";
import { orthoapneaStatusRouter } from "./routes/partners/orthoapnea-status.js";
import { noteRouter } from "./routes/note.js";
import { sleepStudyRouter } from "./routes/sleepStudy.js";
import { treatmentPlanRouter } from "./routes/treatmentPlan.js";
import { runMigrations } from "./db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiter.js";

// Allow multiple origins (e.g. localhost + LAN IP for phone testing): set FRONTEND_URL="http://localhost:5173,http://192.168.1.x:5173"
const corsOrigins = FRONTEND_URLS;

/** In dev, allow localhost, LAN IPs (192.168, 10.x), and link-local (169.254.x.x) on Vite ports. */
const DEV_ORIGIN_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+):(\d+)$/;
const VITE_PORTS = ["5173", "5174", "5175", "5176"];

function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) {
  if (!origin) {
    cb(null, corsOrigins[0] ?? "http://localhost:5173");
    return;
  }
  if (corsOrigins.includes(origin)) {
    cb(null, origin);
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    const m = origin.match(DEV_ORIGIN_REGEX);
    if (m && VITE_PORTS.includes(m[2])) {
      cb(null, origin);
      return;
    }
  }
  cb(null, false);
}

export const app: Express = express();

// Registered before any other middleware (rate limiter, CORS, auth) so Render's
// health checker never gets rate-limited or blocked by an unrelated dependency —
// a 429/5xx here makes Render think the whole instance is down.
app.get("/health", (_req, res) => res.json({ ok: true }));

// Render (and any reverse-proxy host) sits in front of this process and sets
// X-Forwarded-For / X-Forwarded-Proto. Without this, express-rate-limit
// refuses to trust X-Forwarded-For (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set("trust proxy", 1);

app.use(requestIdMiddleware);
// Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, CSP, etc.
// CSP allows same-origin only; relax specific directives per environment if needed.
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production",
    crossOriginEmbedderPolicy: false, // disabled — API is consumed by a separate frontend origin
  })
);
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "50kb" }));
app.use(apiLimiter);

// Every /api/v1 response is per-request-credential (keyed off the Authorization bearer
// token, not the URL). Without this, a browser's heuristic HTTP cache or an intermediate
// proxy (common on managed/shared rep phones) can serve a previously cached response — e.g.
// a stale GET /auth/session body from a prior user's token on the same device — to a
// different, correctly logged-in user. "Vary: Authorization" is defense-in-depth for any
// cache that does respect Vary.
app.use("/api/v1", (_req, res, next) => {
  res.set("Cache-Control", "no-store, private");
  res.set("Vary", "Authorization");
  next();
});

// All API routes are versioned under /api/v1 — auth router registers /auth/* paths separately
app.use("/api/v1", authRouter);
app.use("/api/v1", leadsRouter);
app.use("/api/v1", practitionerRouter);
app.use("/api/v1", organizationRouter);
app.use("/api/v1", presentationRouter);
app.use("/api/v1", diagnosticsRouter);
app.use("/api/v1", encounterRouter);
app.use("/api/v1", configRouter);
app.use("/api/v1", lookupRouter);
app.use("/api/v1", websiteContactRouter);
app.use("/api/v1", bookingRouter);
app.use("/api/v1", publicRouter);
app.use("/api/v1", patientRouter);
app.use("/api/v1", pushRouter);
app.use("/api/v1", usersRouter);
app.use("/api/v1", inviteRouter);
app.use("/api/v1", notificationRouter);
app.use("/api/v1", orthoapneaResourcesRouter);
app.use("/api/v1", orthoapneaStatusRouter);
app.use("/api/v1", noteRouter);
app.use("/api/v1", sleepStudyRouter);
app.use("/api/v1", treatmentPlanRouter);

app.use(errorHandler);

let server: ReturnType<typeof app.listen> | null = null;

// =============================================================================
// GLOBAL PROCESS ERROR HANDLERS
// These are the top-level safety net for the entire Node.js process.
//
// unhandledRejection: fires when a Promise rejects and nobody .catch()es it.
//   Example: a background async function that throws after an await.
//   Without this handler Node 15+ exits the process with code 1 immediately.
//
// uncaughtException: fires for synchronous throws that escape all try/catch blocks.
//   This is a last resort — the process is in an unknown state. We log, then
//   exit so the process manager (systemd, Docker) restarts cleanly.
//
// Both write to stderr and should eventually write to platform.errors.
// =============================================================================
process.on("unhandledRejection", (reason, promise) => {
  console.error("[process] unhandledRejection at:", promise, "reason:", reason);
  // Do NOT exit here — unhandledRejection is often recoverable (e.g. a failed
  // background audit write). The request that caused it has already responded.
});

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException — process will exit:", err);
  // Attempt a graceful server close so in-flight requests finish.
  server?.close(() => process.exit(1));
  // Force exit after 5s if graceful close hangs.
  setTimeout(() => process.exit(1), 5_000).unref();
});

if (typeof process.env.VITEST === "undefined") {
  const port = parseInt(process.env.PORT ?? "3000", 10);

  /**
   * Supabase's pooler can be cold (idle project waking up) on the first connection of the day,
   * which sometimes takes longer to respond than a plain connection timeout allows. Retrying a
   * couple of times with backoff avoids crashing the whole dev/prod boot over a transient wake-up
   * delay — a real outage still surfaces, just after these attempts are exhausted.
   */
  async function runMigrationsWithRetry(attempts = 3, delayMs = 3_000): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await runMigrations();
        return;
      } catch (err) {
        if (attempt === attempts) throw err;
        console.warn(
          `[neocrm-api] DB connection attempt ${attempt}/${attempts} failed, retrying in ${delayMs}ms:`,
          err instanceof Error ? err.message : err
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async function start() {
    await runMigrationsWithRetry();
    await ensureInitialUserPasswords(process.env.DEFAULT_TENANT_SLUG ?? "neosleep");
    server = app.listen(port, () => {
      console.log(`[neocrm-api] listening on http://localhost:${port}`);
    });
  }

  start().catch((err) => {
    console.error("[neocrm-api] failed to start:", err);
    process.exit(1);
  });
}

export { server };
