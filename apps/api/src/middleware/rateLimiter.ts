import rateLimit from "express-rate-limit";

/** Applied to POST /api/contact — 5 requests per 15 minutes per IP. */
export const contactFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied to POST /invite/accept — public, unauthenticated; 5 attempts per 15 minutes per IP. */
export const inviteAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * Applied to GET /invite/document — public, token-gated (NEO-51). A doctor
 * opens each of the 2 documents, maybe re-opens after editing details —
 * 30 per 15 minutes per IP is generous for that and still caps scraping the
 * signatory's signature image with a leaked token.
 */
export const invitePreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied to GET /booking/slots and POST /booking/book — public, unauthenticated; 20 requests per 15 minutes per IP. */
export const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied to GET /public/lead/:id — public, unauthenticated; 30 requests per 15 minutes per IP. */
export const publicLeadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied to GET /public/specialists — public, unauthenticated, read-only; 60 requests per 15 minutes per IP. */
export const publicSpecialistsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * Patient self-fill questionnaire (QR link, /public/questionnaire/:token) —
 * public, unauthenticated. Reads get headroom for page reloads; submits are
 * tight (a patient submits once, and the token is single-use anyway).
 */
export const publicQuestionnaireReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

export const publicQuestionnaireSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * Applied to GET /health/pdf — public, unauthenticated, and each call launches
 * a real Chromium render. One shared bucket for all callers (not per IP), so
 * no amount of distributed traffic can make it render more than 3 PDFs a
 * minute; the post-deploy smoke test needs one.
 */
export const smokePdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  keyGenerator: () => "smoke-pdf",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * Applied to POST /diagnostics — public and unauthenticated (the website and the
 * PWA's login screen report errors before anyone is signed in), so it gets its
 * own per-IP ceiling on top of the global apiLimiter (NEO-81). 60 per 15 minutes
 * is far above what a real browser sends — reportCaught dedupes identical errors
 * for 5 s — and low enough that nobody can flood platform.diagnostics.
 */
export const diagnosticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * Applied globally — 1000 requests per 15 minutes per IP (~1/s sustained).
 *
 * Was 200, which one active PWA user exceeds within minutes (every list view fans out into
 * several calls, and each 429 triggers a POST /diagnostics that is itself limited). On Render
 * the counter was reset by frequent restarts, which hid this; on Cloud Run (NEO-45) the
 * instance lives longer and users started getting 429s. Brute-force-sensitive routes keep
 * their own much tighter limiters (login, invite accept, public forms).
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
