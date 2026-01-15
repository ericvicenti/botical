/**
 * Hono Application Setup
 *
 * Creates the HTTP server using Hono framework with middleware stack.
 * See: docs/knowledge-base/01-architecture.md#hono
 *
 * The transport layer supports multiple protocols:
 * - REST endpoints (auth, uploads, health)
 * - WebSocket (primary, real-time)
 * - SSE fallback (limited environments)
 *
 * See: docs/knowledge-base/01-architecture.md#transport-layer
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleError, logger, requestId } from "./middleware/index.ts";
import { health, auth, credentials } from "./routes/index.ts";

/**
 * Create the Hono application with middleware and routes.
 *
 * Middleware order is important:
 * 1. requestId - Assigns unique ID for request tracing
 * 2. logger - Logs requests with timing
 * 3. cors - Handles cross-origin requests
 *
 * See: docs/knowledge-base/01-architecture.md#rest-api
 */
export function createApp() {
  const app = new Hono();

  // Global error handler
  app.onError((err, c) => {
    return handleError(err, c);
  });

  // Global middleware (order matters)
  app.use("*", requestId());
  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: "*", // Configure in production
      allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
    })
  );

  // Mount routes
  app.route("/health", health);
  app.route("/auth", auth);
  app.route("/credentials", credentials);

  // API routes (placeholder for future)
  app.get("/api", (c) => {
    return c.json({
      name: "Iris API",
      version: "0.1.0",
      status: "ok",
    });
  });

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: `Route not found: ${c.req.method} ${c.req.path}`,
        },
      },
      404
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
