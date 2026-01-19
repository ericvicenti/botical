import { createApp } from "./app.ts";
import { Config } from "../config/index.ts";
import { DatabaseManager } from "../database/index.ts";
import { setupBusBridge, teardownBusBridge } from "../websocket/index.ts";
import { websocket } from "hono/bun";
import { registerCoreTools } from "../tools/index.ts";
import { ServiceRunner } from "../services/service-runner.ts";

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

  // Register core tools for agent use
  registerCoreTools();

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

  // Start auto-start services (don't await - let it run in background)
  ServiceRunner.startAutoServices().catch((error) => {
    console.error("Failed to start auto-start services:", error);
  });

  return {
    port,
    hostname,
    close: async () => {
      // Stop all running services
      await ServiceRunner.stopAllServices();
      teardownBusBridge();
      server.stop();
      DatabaseManager.closeAll();
    },
  };
}
