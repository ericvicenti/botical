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
 * In production, also serves static frontend files.
 * See: docs/deployment.md
 *
 * See: docs/knowledge-base/01-architecture.md#transport-layer
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import { existsSync } from "fs";
import { handleError, logger, requestId } from "./middleware/index.ts";
import { requireAuth } from "../auth/middleware.ts";
import { health, auth, credentials, sessions, messages, agents, projects, tools, sessionTodos, todos, projectMissions, missions, projectTasks, tasks, projectProcesses, processes, projectServices, services, files, projectGit, gitClone, gitIdentity, workflows, workflowExecutions, filesystem, skills, templates, extensionsRouter, projectSchedules, schedules, oauthProxy, status, statusPage } from "./routes/index.ts";
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

  // Security headers in production (includes HSTS)
  if (process.env.NODE_ENV === "production") {
    app.use(
      "*",
      secureHeaders({
        strictTransportSecurity: "max-age=31536000; includeSubDomains",
      })
    );
  }

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
  app.route("/status", statusPage); // Live status dashboard (no auth)
  app.route("/status/data", status); // Status API (no auth, outside /api/* auth)
  app.route("/auth", auth);
  app.route("/api/credentials", credentials);
  app.route("/oauth", oauthProxy);

  // Global auth middleware for all API routes
  // In single-user mode, this auto-authenticates as the local user
  app.use("/api/*", requireAuth());

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
  app.route("/api/projects", projectGit); // Project-scoped git routes
  app.route("/api/projects", gitClone); // Clone repository route
  app.route("/api/git", gitIdentity); // Git identity (SSH key) route
  app.route("/api/workflows", workflows); // Workflow routes
  app.route("/api", workflowExecutions); // Workflow execution routes
  app.route("/api/filesystem", filesystem); // Filesystem browsing routes
  app.route("/api/projects", skills); // Project-scoped skills routes
  app.route("/api/skills", skills); // Skills search route (non-project-scoped)
  app.route("/api/templates", templates); // Task templates routes
  app.route("/api/extensions", extensionsRouter); // Extension proxy routes
  app.route("/api/projects", projectSchedules); // Project-scoped schedule routes
  app.route("/api/schedules", schedules); // Individual schedule routes
  // Status routes registered above (before auth middleware)

  // WebSocket endpoint
  // See: docs/implementation-plan/05-realtime-communication.md
  app.get("/ws", createWebSocketHandler());

  // API routes (placeholder for future)
  app.get("/api", (c) => {
    return c.json({
      name: "Botical API",
      version: "0.1.0",
      status: "ok",
    });
  });

  // Static file serving for production
  // In development, Vite serves the frontend with HMR
  // In production, the built frontend is served from BOTICAL_STATIC_DIR
  // See: docs/deployment.md
  const staticDir = process.env.BOTICAL_STATIC_DIR;
  if (staticDir && existsSync(staticDir)) {
    // Serve static files from the built frontend directory
    app.use(
      "/*",
      serveStatic({
        root: staticDir,
        rewriteRequestPath: (path) => path,
      })
    );

    // SPA fallback: serve index.html for any unmatched routes
    // This enables client-side routing in the React app
    // Skip asset paths — if a static file wasn't found, it's a real 404
    app.get("*", async (c) => {
      const path = c.req.path;
      if (path.startsWith("/assets/") || path.match(/\.(css|js|map|png|jpg|svg|ico|woff2?)$/)) {
        return c.notFound();
      }
      const indexPath = `${staticDir}/index.html`;
      if (existsSync(indexPath)) {
        const content = await Bun.file(indexPath).text();
        return c.html(content);
      }
      return c.notFound();
    });
  }

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
