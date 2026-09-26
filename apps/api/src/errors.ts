export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} '${id}' not found` : `${resource} not found`,
      "NOT_FOUND",
      404
    );
  }
}

export class DatabaseError extends AppError {
  constructor(operation: string, cause: unknown) {
    super(`Database error: ${operation}`, "DB_ERROR", 503, cause);
  }
}

/** Why a field was rejected — the PWA picks its message from this when it has no field-specific one. */
export type ValidationReason = "required" | "invalid";

// "first_name is required", "email cannot be blank", "notes must be at most …" — a lower-case
// payload key (snake_case or one word) that leads the message and is followed by a verdict.
const LEADING_KEY = /^([a-z][a-z0-9_]*) (?:is|must|cannot|does|should)\b/i;
// "Invalid email format", "Invalid organization type: x", "Invalid study_type 'x' — …"
// (one optional word between "Invalid" and the key, tried last).
const INVALID_KEY = /^Invalid (?:[a-z]+ )??([a-z][a-z0-9_]*)(?= format\b|:| '|$)/i;
// A message led by an id ("patient id is required", "Missing lead id") is about the URL, not a form field.
const NOT_A_FIELD = new Set([
  "id", "missing", "uploaded", "unknown", "unsupported", "an", "no", "only",
  // "Practitioner must have an email …" — a record, not a payload key.
  "practitioner", "patient", "lead", "organization", "user", "territory", "appointment",
]);

/**
 * The payload key a validation message is about, read from the message itself —
 * every command already writes them key-first ("first_name is required"), so this
 * names the field for the ~350 existing throws without touching each one (NEO-109).
 */
export function inferValidationField(message: string): string | undefined {
  const match = LEADING_KEY.exec(message) ?? INVALID_KEY.exec(message);
  const key = match?.[1].toLowerCase();
  return key && !NOT_A_FIELD.has(key) ? key : undefined;
}

export function inferValidationReason(message: string): ValidationReason {
  return /\b(?:is required|cannot be (?:blank|empty)|required$)/i.test(message) ? "required" : "invalid";
}

export class ValidationError extends AppError {
  /**
   * The payload key that failed (e.g. "date_of_birth"), so the PWA marks that
   * field in the form instead of showing a toast (NEO-109). Pass it when the
   * message doesn't start with the key; otherwise it's read from the message.
   * Undefined for errors no single field can fix.
   */
  public readonly field?: string;
  public readonly reason: ValidationReason;

  constructor(message: string, field?: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.field = field ?? inferValidationField(message);
    this.reason = inferValidationReason(message);
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "AUTH_ERROR", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN", 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(message, code, 409);
  }
}

/**
 * NEO-111: identities.email is unique among everyone except patients (users,
 * doctors, leads — migration 037), so saving one of those with an email
 * another of them already has would otherwise surface as an opaque 23505
 * "Database error". The code + field let the form mark the Email field with a
 * translated message instead.
 */
export class EmailInUseError extends ConflictError {
  readonly field = "email";
  readonly reason = "taken";

  constructor(email: string) {
    super(`Email "${email}" is already in use by another person.`, "EMAIL_IN_USE");
  }
}

/**
 * NEO-51: the partner onboarding documents can't be countersigned for this
 * jurisdiction yet — no NeoSleep signatory configured, or the current
 * agreement/DPA version hasn't been approved by that signatory. Raised at
 * activation (so no invite goes out that can't be completed) and again at
 * preview/accept time.
 */
export class PartnerDocumentsNotReadyError extends AppError {
  constructor(message: string) {
    super(message, "PARTNER_DOCUMENTS_NOT_READY", 409);
  }
}

/**
 * NEO-51: the doctor signed a document version that is no longer the
 * current, approved one (an admin published a newer text in the meantime).
 * The PWA re-loads the documents and asks them to read and sign again.
 */
export class StaleDocumentVersionError extends AppError {
  constructor() {
    super("This document was updated. Please read it again and sign.", "DOCUMENT_VERSION_STALE", 409);
  }
}

export class PartnerServiceError extends AppError {
  constructor(partner: string, message: string, cause?: unknown) {
    super(`${partner}: ${message}`, "PARTNER_SERVICE_ERROR", 502, cause);
  }
}

/**
 * HTML→PDF rendering failed (headless Chromium could not launch, or the
 * page could not be rendered). Kept distinct from DatabaseError so that
 * withTenant() — which rewraps any non-AppError as "Database error:
 * withTenant" — passes the real cause through to the caller instead.
 */
export class DocumentRenderError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(`PDF rendering failed: ${message}`, "RENDER_ERROR", 503, cause);
  }
}
