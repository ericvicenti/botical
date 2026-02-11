/**
 * OAuth Proxy Routes
 *
 * Proxies OAuth token exchange requests to avoid CORS issues
 * when calling third-party OAuth endpoints from the browser.
 */

import { Hono } from "hono";

const oauthProxy = new Hono();

/**
 * POST /oauth/anthropic/token
 * Proxy token exchange to Anthropic's OAuth endpoint
 */
oauthProxy.post("/anthropic/token", async (c) => {
  const body = await c.req.json();

  const resp = await fetch("https://console.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await resp.text();

  return new Response(data, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("Content-Type") || "application/json" },
  });
});

export { oauthProxy };
