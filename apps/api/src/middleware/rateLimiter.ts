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

/** Applied globally — 200 requests per 15 minutes per IP. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
