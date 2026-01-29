/**
 * Search Extension Server
 *
 * Standalone HTTP server for the Search extension.
 * Runs on its own port and provides web search APIs via SearXNG.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { searchRouter } from "./routes/search.ts";

// Get port from environment (set by extension manager)
const port = parseInt(process.env.EXTENSION_PORT || "4102", 10);
const extensionId = process.env.EXTENSION_ID || "search";

// Create the Hono app
const app = new Hono();

// CORS middleware
app.use("*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", extension: extensionId });
});

// Mount routes
app.route("/search", searchRouter);

// Legacy route for /status at root level
app.get("/status", async (c) => {
  // Forward to search router status endpoint
  return c.redirect("/search/status");
});

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
