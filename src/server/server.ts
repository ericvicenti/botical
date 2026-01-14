import { createApp } from "./app.ts";
import { Config } from "../config/index.ts";
import { DatabaseManager } from "../database/index.ts";

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
 * Create and start the HTTP server
 */
export async function createServer(
  options: ServerOptions = {}
): Promise<ServerInstance> {
  // Load configuration
  const config = Config.load(options);

  // Initialize database
  await DatabaseManager.initialize();

  // Create app
  const app = createApp();

  // Start server
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: app.fetch,
  });

  // Server.port and hostname are always defined when serving HTTP
  const port = server.port ?? config.port;
  const hostname = server.hostname ?? config.host;

  console.log(`🚀 Iris server running at http://${hostname}:${port}`);

  return {
    port,
    hostname,
    close: async () => {
      server.stop();
      DatabaseManager.closeAll();
    },
  };
}
