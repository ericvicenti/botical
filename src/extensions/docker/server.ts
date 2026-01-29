/**
 * Docker Extension Server
 *
 * Standalone HTTP server for the Docker extension.
 * Runs on its own port and provides Docker management APIs.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { containersRouter } from "./routes/containers.ts";
import { imagesRouter } from "./routes/images.ts";
import { infoRouter } from "./routes/info.ts";

// Get port from environment (set by extension manager)
const port = parseInt(process.env.EXTENSION_PORT || "4101", 10);
const extensionId = process.env.EXTENSION_ID || "docker";

// Create the Hono app
const app = new Hono();

// CORS middleware
app.use("*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", extension: extensionId });
});

// Mount routes
app.route("/containers", containersRouter);
app.route("/images", imagesRouter);
app.route("/info", infoRouter);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(`[${extensionId}] Error:`, err);
  return c.json({ error: err.message }, 500);
});

// Start server
console.log(`[${extensionId}] Starting server on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
