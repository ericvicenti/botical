import type { MiddlewareHandler } from "hono";
import { generateId } from "../../utils/id.ts";

/**
 * Request ID Middleware
 *
 * Adds a unique request ID to each request for tracing.
 */
export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    // Check for existing request ID header
    let reqId = c.req.header("X-Request-Id");

    if (!reqId) {
      reqId = generateId("req");
    }

    // Store in context for access by handlers
    c.set("requestId", reqId);

    // Add to response headers
    c.header("X-Request-Id", reqId);

    await next();
  };
}

/**
 * Get request ID from context (type-safe)
 */
export function getRequestId(c: { get: (key: string) => unknown }): string {
  return (c.get("requestId") as string) || "unknown";
}
