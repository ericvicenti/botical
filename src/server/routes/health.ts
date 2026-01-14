import { Hono } from "hono";
import { DatabaseManager } from "../../database/index.ts";

const health = new Hono();

/**
 * Health Check Endpoint
 *
 * GET /health - Basic health check
 * GET /health/ready - Readiness check (includes database)
 * GET /health/live - Liveness check
 */

// Basic health check
health.get("/", (c) => {
  return c.json({
    status: "ok",
    timestamp: Date.now(),
  });
});

// Readiness check - verifies system is ready to accept traffic
health.get("/ready", (c) => {
  try {
    // Check database connectivity
    const db = DatabaseManager.getRootDb();
    const result = db.prepare("SELECT 1").get();

    if (!result) {
      return c.json(
        {
          status: "error",
          message: "Database check failed",
          timestamp: Date.now(),
        },
        503
      );
    }

    return c.json({
      status: "ok",
      timestamp: Date.now(),
      checks: {
        database: "ok",
      },
    });
  } catch (error) {
    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      },
      503
    );
  }
});

// Liveness check - verifies process is running
health.get("/live", (c) => {
  return c.json({
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

export { health };
