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
  constructor(message: string) {
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
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class PartnerServiceError extends AppError {
  constructor(partner: string, message: string, cause?: unknown) {
    super(`${partner}: ${message}`, "PARTNER_SERVICE_ERROR", 502, cause);
  }
}
