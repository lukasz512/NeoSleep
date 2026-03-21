import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import cors from "cors";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { authRouter } from "./auth.js";
import { leadsRouter } from "./routes/leads.js";
import { hcpRouter } from "./routes/hcp.js";
import { hcoRouter } from "./routes/hco.js";
import { presentationsRouter } from "./routes/presentations.js";
import { diagnosticsRouter } from "./routes/diagnostics.js";
import { eventsRouter } from "./routes/events.js";
import { configRouter } from "./routes/config.js";
import { configOptionsRouter } from "./routes/config-options.js";
import { websiteContactRouter } from "./routes/website-contact.js";
import { patientsRouter } from "./routes/patients.js";
import { pushRouter } from "./routes/push.js";
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

export const app = express();

app.use(requestIdMiddleware);
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
app.use(authRouter);
app.use(leadsRouter);
app.use(hcpRouter);
app.use(hcoRouter);
app.use(presentationsRouter);
app.use(diagnosticsRouter);
app.use(eventsRouter);
app.use(configRouter);
app.use(configOptionsRouter);
app.use(websiteContactRouter);
app.use(patientsRouter);
app.use(pushRouter);

app.use(errorHandler);

let server: ReturnType<typeof app.listen> | null = null;

if (typeof process.env.VITEST === "undefined") {
  const port = parseInt(process.env.PORT ?? "3000", 10);

  async function start() {
    await runMigrations();
    server = app.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
    });
  }

  start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

export { server };
