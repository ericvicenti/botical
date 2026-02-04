import { createApp } from "./app.ts";
import { Config } from "../config/index.ts";
import { DatabaseManager } from "../database/index.ts";
import { setupBusBridge, teardownBusBridge } from "../websocket/index.ts";
import { websocket } from "hono/bun";
import { registerCoreTools } from "../tools/index.ts";
import { registerAllActions } from "../actions/index.ts";
import { ServiceRunner } from "../services/service-runner.ts";
import { Scheduler } from "../services/scheduler.ts";
import { ExtensionRegistry, startExtensionServer, stopAllExtensionServers } from "../extensions/index.ts";
import { ProjectService } from "../services/projects.ts";
import { ProjectConfigService } from "../config/project.ts";

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

  // Register actions (unified tool/command system)
  registerAllActions();

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

  // Start the scheduler for recurring tasks
  Scheduler.start();

  // Start extension servers only for extensions enabled in at least one project
  (async () => {
    // Get all enabled extensions across all projects
    const rootDb = DatabaseManager.getRootDb();
    const projects = ProjectService.list(rootDb, {});
    const enabledExtensionIds = new Set<string>();

    for (const project of projects) {
      if (project.path) {
        const enabled = ProjectConfigService.getEnabledExtensions(project.path);
        for (const id of enabled) {
          enabledExtensionIds.add(id);
        }
      }
    }

    // Only start extensions that are enabled in at least one project
    for (const extension of ExtensionRegistry.getAll()) {
      if (!enabledExtensionIds.has(extension.id)) {
        console.log(`[ExtensionManager] Skipping extension ${extension.id} (not enabled in any project)`);
        continue;
      }

      try {
        await startExtensionServer(extension);
      } catch (error) {
        console.error(`Failed to start extension ${extension.id}:`, error);
      }
    }
  })();

  return {
    port,
    hostname,
    close: async () => {
      // Stop the scheduler
      Scheduler.stop();
      // Stop all running services
      await ServiceRunner.stopAllServices();
      // Stop all extension servers
      await stopAllExtensionServers();
      teardownBusBridge();
      server.stop();
      DatabaseManager.closeAll();
    },
  };
}
