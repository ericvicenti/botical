/**
 * Search Routes
 *
 * HTTP endpoints for the search extension.
 */

import { Hono } from "hono";
import { z } from "zod";
import { SearxngClient, type SearchOptions } from "../client.ts";
import {
  ensureSearxngRunning,
  getStatus,
  stopSearxng,
  removeSearxng,
} from "../provisioner.ts";

// Get SearXNG port from environment
const searxngPort = parseInt(process.env.SEARXNG_PORT || "8888", 10);
const searxngUrl = `http://localhost:${searxngPort}`;

export const searchRouter = new Hono();

// ============================================================================
// Search Endpoints
// ============================================================================

/**
 * GET /search - Perform a web search
 */
searchRouter.get("/", async (c) => {
  const query = c.req.query("q");
  const limitStr = c.req.query("limit");
  const categories = c.req.query("categories");
  const engines = c.req.query("engines");
  const language = c.req.query("language");
  const safesearchStr = c.req.query("safesearch");
  const timeRange = c.req.query("time_range");

  if (!query) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  const options: SearchOptions = {};

  if (limitStr) {
    const limit = parseInt(limitStr, 10);
    if (!isNaN(limit) && limit > 0) {
      options.limit = Math.min(limit, 50); // Cap at 50
    }
  }

  if (categories) {
    options.categories = categories.split(",");
  }

  if (engines) {
    options.engines = engines.split(",");
  }

  if (language) {
    options.language = language;
  }

  if (safesearchStr) {
    const safesearch = parseInt(safesearchStr, 10);
    if (safesearch >= 0 && safesearch <= 2) {
      options.safesearch = safesearch; // Safe: validated above as 0, 1, or 2
    }
  }

  if (timeRange && ["day", "week", "month", "year"].includes(timeRange)) {
    options.timeRange = timeRange; // Safe: validated above as valid time range
  }

  try {
    const results = await SearxngClient.search(query, { ...options, baseUrl: searxngUrl });
    return c.json({ data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /suggest - Get search suggestions
 */
searchRouter.get("/suggest", async (c) => {
  const query = c.req.query("q");

  if (!query) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  try {
    const suggestions = await SearxngClient.suggest(query, { baseUrl: searxngUrl });
    return c.json({ data: suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suggestions failed";
    return c.json({ error: message }, 500);
  }
});

// ============================================================================
// Status Endpoints
// ============================================================================

/**
 * GET /status - Get SearXNG status
 */
searchRouter.get("/status", async (c) => {
  try {
    const status = await getStatus({ port: searxngPort });
    return c.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get status";
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /available - Check if SearXNG is available
 */
searchRouter.get("/available", async (c) => {
  try {
    const available = await SearxngClient.isAvailable(searxngUrl);
    return c.json({ available });
  } catch {
    return c.json({ available: false });
  }
});

// ============================================================================
// Provisioning Endpoints
// ============================================================================

/**
 * POST /provision - Provision/start SearXNG container
 */
searchRouter.post("/provision", async (c) => {
  try {
    const status = await ensureSearxngRunning({ port: searxngPort });
    return c.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provisioning failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /stop - Stop SearXNG container
 */
searchRouter.post("/stop", async (c) => {
  try {
    await stopSearxng();
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stop failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * DELETE /container - Remove SearXNG container
 */
searchRouter.delete("/container", async (c) => {
  try {
    await removeSearxng();
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Remove failed";
    return c.json({ error: message }, 500);
  }
});
