import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleError, logger, requestId } from "./middleware/index.ts";
import { health } from "./routes/index.ts";

/**
 * Create the Hono application with all middleware and routes
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
