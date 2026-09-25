import rateLimit from "express-rate-limit";

/** Applied to POST /api/contact — 5 requests per 15 minutes per IP. */
export const contactFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied to POST /invite/accept — public, unauthenticated; 5 attempts per 15 minutes per IP. */
export const inviteAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied to GET /booking/slots and POST /booking/book — public, unauthenticated; 20 requests per 15 minutes per IP. */
export const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied to GET /public/lead/:id — public, unauthenticated; 30 requests per 15 minutes per IP. */
export const publicLeadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied to GET /public/specialists — public, unauthenticated, read-only; 60 requests per 15 minutes per IP. */
export const publicSpecialistsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
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
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

export const publicQuestionnaireSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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
  max: 3,
  keyGenerator: () => "smoke-pdf",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Applied globally — 200 requests per 15 minutes per IP. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
