import express, { type Express } from "express";
import helmet from "helmet";
import session from "express-session";
import cookieParser from "cookie-parser";
import cors from "cors";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { authRouter } from "./auth.js";
import { leadsRouter } from "./routes/leads.js";
import { practitionerRouter } from "./routes/practitioner.js";
import { organizationRouter } from "./routes/organization.js";
import { presentationsRouter } from "./routes/presentations.js";
import { diagnosticsRouter } from "./routes/diagnostics.js";
import { encounterRouter } from "./routes/encounter.js";
import { configRouter } from "./routes/config.js";
import { lookupRouter } from "./routes/lookup.js";
import { websiteContactRouter } from "./routes/website-contact.js";
import { patientRouter } from "./routes/patient.js";
import { pushRouter } from "./routes/push.js";
import { usersRouter } from "./routes/users.js";
import { runMigrations } from "./db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiter.js";

const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
const sessionSecret = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";

// Allow multiple origins (e.g. localhost + LAN IP for phone testing): set FRONTEND_URL="http://localhost:5173,http://192.168.1.x:5173"
const corsOrigins = frontendUrl.split(",").map((s) => s.trim()).filter(Boolean);

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
app.use(cookieParser());
app.use(express.json({ limit: "50kb" }));
app.use(apiLimiter);
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

// All BFF routes are versioned under /api/v1 — auth router registers /auth/* paths separately
app.use("/api/v1", authRouter);
app.use("/api/v1", leadsRouter);
app.use("/api/v1", practitionerRouter);
app.use("/api/v1", organizationRouter);
app.use("/api/v1", presentationsRouter);
app.use("/api/v1", diagnosticsRouter);
app.use("/api/v1", encounterRouter);
app.use("/api/v1", configRouter);
app.use("/api/v1", lookupRouter);
app.use("/api/v1", websiteContactRouter);
app.use("/api/v1", patientRouter);
app.use("/api/v1", pushRouter);
app.use("/api/v1", usersRouter);

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

  async function start() {
    await runMigrations();
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
