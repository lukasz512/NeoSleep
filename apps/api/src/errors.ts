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

export class ValidationError extends AppError {
  /**
   * `field` names the payload key that failed (e.g. "date_of_birth"), when
   * one does — the PWA's FormRenderer marks that field instead of showing a
   * toast (NEO-109). Leave it out for errors no single field can fix.
   */
  constructor(message: string, public readonly field?: string) {
    super(message, "VALIDATION_ERROR", 400);
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
