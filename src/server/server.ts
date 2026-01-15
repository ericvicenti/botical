import { createApp } from "./app.ts";
import { Config } from "../config/index.ts";
import { DatabaseManager } from "../database/index.ts";
import { setupBusBridge, teardownBusBridge } from "../websocket/index.ts";
import { websocket } from "hono/bun";

export interface ServerOptions {
  port?: number;
  host?: string;
}

export interface ServerInstance {
  port: number;
  hostname: string;
  close: () => Promise<void>;
}

/**
 * Create and start the HTTP server with WebSocket support
 */
export async function createServer(
  options: ServerOptions = {}
): Promise<ServerInstance> {
  // Load configuration
  const config = Config.load(options);

  // Initialize database
  await DatabaseManager.initialize();

  // Create app with WebSocket route
  const app = createApp();

  // Set up event bus bridge for WebSocket
  setupBusBridge();

  // Start server with WebSocket support
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: app.fetch,
    websocket,
  });

  // Server.port and hostname are always defined when serving HTTP
  const port = server.port ?? config.port;
  const hostname = server.hostname ?? config.host;

  console.log(`🚀 Iris server running at http://${hostname}:${port}`);
  console.log(`🔌 WebSocket available at ws://${hostname}:${port}/ws`);

  return {
    port,
    hostname,
    close: async () => {
      teardownBusBridge();
      server.stop();
      DatabaseManager.closeAll();
    },
  };
}
