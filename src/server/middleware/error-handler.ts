/**
 * Error Handler Middleware
 *
 * Converts errors to consistent JSON responses.
 * See: docs/knowledge-base/04-patterns.md#error-handler-middleware
 *
 * Handles three error types:
 * - IrisError: Custom typed errors with code and statusCode
 * - ZodError: Validation failures converted to 400 responses
 * - Generic Error: Logged and returned as 500
 */

import { ZodError } from "zod";
import { IrisError, ValidationError } from "../../utils/errors.ts";

/**
 * Handle errors for Hono's onError handler.
 * See: docs/knowledge-base/04-patterns.md#error-handling-pattern
 */
export function handleError(error: Error | unknown, c: { json: (data: unknown, status: number) => Response }) {
  // Handle Iris errors
  if (error instanceof IrisError) {
    return c.json(error.toJSON(), error.statusCode);
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationError = new ValidationError(
      "Validation failed",
      error.errors
    );
    return c.json(validationError.toJSON(), 400);
  }

  // Handle generic errors
  if (error instanceof Error) {
    console.error("Unhandled error:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            process.env.NODE_ENV === "production"
              ? "An unexpected error occurred"
              : error.message,
        },
      },
      500
    );
  }

  // Unknown error type
  console.error("Unknown error type:", error);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    500
  );
}
