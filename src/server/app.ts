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
import { health, auth, credentials, sessions, messages, agents, projects, tools, sessionTodos, todos, projectMissions, missions, projectTasks, tasks, projectProcesses, processes, projectServices, services, files, projectApps, apps } from "./routes/index.ts";
import { createWebSocketHandler } from "../websocket/index.ts";

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

  // API routes
  app.route("/api/projects", projects);
  app.route("/api/projects", projectMissions); // Project-scoped mission routes
  app.route("/api/projects", projectTasks); // Project-scoped task routes
  app.route("/api/sessions", sessions);
  app.route("/api/sessions", sessionTodos); // Session-scoped todo routes (backwards compat)
  app.route("/api/messages", messages);
  app.route("/api/agents", agents);
  app.route("/api/tools", tools);
  app.route("/api/todos", todos); // Individual todo routes (backwards compat)
  app.route("/api/missions", missions); // Individual mission routes
  app.route("/api/tasks", tasks); // Individual task routes
  app.route("/api/projects", projectProcesses); // Project-scoped process routes
  app.route("/api/processes", processes); // Individual process routes
  app.route("/api/projects", projectServices); // Project-scoped service routes
  app.route("/api/services", services); // Individual service routes
  app.route("/api/projects", files); // Project-scoped file routes
  app.route("/api/projects", projectApps); // Project-scoped app routes
  app.route("/api/apps", apps); // Individual app routes

  // WebSocket endpoint
  // See: docs/implementation-plan/05-realtime-communication.md
  app.get("/ws", createWebSocketHandler());

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
