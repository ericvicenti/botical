/**
 * Custom Error Types for Botical
 *
 * Typed errors enable consistent error handling across the application.
 * See: docs/knowledge-base/04-patterns.md#error-handling-pattern
 *
 * All errors extend BoticalError with:
 * - code: Machine-readable error identifier
 * - statusCode: HTTP status for API responses
 * - details: Optional structured data for debugging
 *
 * Error handler middleware converts these to consistent JSON responses.
 * See: docs/knowledge-base/04-patterns.md#error-handler-middleware
 */

/**
 * Base error class for all Botical errors
 */
export class BoticalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "BoticalError";
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Resource not found error (404)
 */
export class NotFoundError extends BoticalError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND", 404, { resource, id });
    this.name = "NotFoundError";
  }
}

/**
 * Validation error for invalid input (400)
 */
export class ValidationError extends BoticalError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends BoticalError {
  constructor(message: string = "Authentication required") {
    super(message, "AUTHENTICATION_ERROR", 401);
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization/permission error (403)
 */
export class ForbiddenError extends BoticalError {
  constructor(message: string = "Permission denied") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

/**
 * Resource conflict error (409)
 */
export class ConflictError extends BoticalError {
  constructor(message: string, details?: unknown) {
    super(message, "CONFLICT", 409, details);
    this.name = "ConflictError";
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends BoticalError {
  constructor(message: string, details?: unknown) {
    super(message, "DATABASE_ERROR", 500, details);
    this.name = "DatabaseError";
  }
}

/**
 * Configuration error (500)
 */
export class ConfigurationError extends BoticalError {
  constructor(message: string, details?: unknown) {
    super(message, "CONFIGURATION_ERROR", 500, details);
    this.name = "ConfigurationError";
  }
}

/**
 * Check if an error is an BoticalError
 */
export function isBoticalError(error: unknown): error is BoticalError {
  return error instanceof BoticalError;
}

/**
 * Wrap unknown errors in BoticalError
 */
export function wrapError(error: unknown): BoticalError {
  if (isBoticalError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new BoticalError(error.message, "INTERNAL_ERROR", 500, {
      originalName: error.name,
    });
  }

  return new BoticalError("An unexpected error occurred", "INTERNAL_ERROR", 500, {
    originalError: String(error),
  });
}
