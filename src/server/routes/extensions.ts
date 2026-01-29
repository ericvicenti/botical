/**
 * Extension Proxy Routes
 *
 * Proxies requests from /api/extensions/{extensionId}/* to the
 * corresponding extension server.
 */

import { Hono } from "hono";
import { ExtensionRegistry, getExtensionServerUrl } from "@/extensions/index.ts";

const router = new Hono();

/**
 * List available extensions and their status
 */
router.get("/", (c) => {
  const extensions = ExtensionRegistry.getAll().map((ext) => {
    const state = ExtensionRegistry.getServerState(ext.id);
    return {
      id: ext.id,
      name: ext.name,
      description: ext.description,
      version: ext.version,
      icon: ext.icon,
      category: ext.category,
      frontend: ext.frontend,
      status: state?.status || "stopped",
      port: state?.port,
    };
  });

  return c.json({ data: extensions });
});

/**
 * Get extension details
 */
router.get("/:extensionId", (c) => {
  const extensionId = c.req.param("extensionId");
  const extension = ExtensionRegistry.get(extensionId);

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const state = ExtensionRegistry.getServerState(extensionId);

  return c.json({
    data: {
      id: extension.id,
      name: extension.name,
      description: extension.description,
      version: extension.version,
      icon: extension.icon,
      status: state?.status || "stopped",
      port: state?.port,
      defaultSettings: extension.defaultSettings,
    },
  });
});

/**
 * Proxy all other requests to the extension server
 */
router.all("/:extensionId/*", async (c) => {
  const extensionId = c.req.param("extensionId");
  const extension = ExtensionRegistry.get(extensionId);

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const serverUrl = getExtensionServerUrl(extensionId);

  if (!serverUrl) {
    return c.json(
      {
        error: "Extension server not running",
        details: `Extension "${extensionId}" is registered but its server is not running`,
      },
      503
    );
  }

  // Build the proxied URL - strip the /api/extensions/{extensionId} prefix
  const path = c.req.path.replace(`/api/extensions/${extensionId}`, "");
  const url = new URL(path || "/", serverUrl);

  // Preserve query string
  const queryString = c.req.url.split("?")[1];
  if (queryString) {
    url.search = `?${queryString}`;
  }

  try {
    // Forward the request
    const response = await fetch(url.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== "GET" && c.req.method !== "HEAD"
        ? await c.req.raw.clone().arrayBuffer()
        : undefined,
    });

    // Return the response
    const responseHeaders = new Headers(response.headers);

    // Remove headers that shouldn't be forwarded
    responseHeaders.delete("transfer-encoding");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    console.error(`[ExtensionProxy] Error proxying to ${extensionId}:`, message);

    return c.json(
      {
        error: "Failed to proxy request to extension",
        details: message,
      },
      502
    );
  }
});

export { router as extensionsRouter };
