import { createApp } from "./app.ts";
import { Config } from "../config/index.ts";
import { DatabaseManager } from "../database/index.ts";
import { setupBusBridge, teardownBusBridge } from "../websocket/index.ts";
import { websocket } from "hono/bun";
import { registerCoreTools } from "../tools/index.ts";
import { registerAllActions } from "../actions/index.ts";
import { ServiceRunner } from "../services/service-runner.ts";
import { Scheduler } from "../services/scheduler.ts";
import { startTelegramBot, stopTelegramBot } from "../integrations/telegram.ts";
import { ExtensionRegistry, startExtensionServer, stopAllExtensionServers } from "../extensions/index.ts";
import { ProjectService } from "../services/projects.ts";
import { ProjectConfigService } from "../config/project.ts";

/**
 * Mark stale incomplete assistant messages as errored on startup.
 * These are messages where the LLM stream died (crash/restart) without completing.
 */
function cleanupStaleMessages() {
  try {
    const rootDb = DatabaseManager.getRootDb();
    const projects = ProjectService.list(rootDb, {});
    const now = Date.now();
    let totalCleaned = 0;

    for (const project of projects) {
      try {
        const db = DatabaseManager.getProjectDb(project.id);
        const result = db.prepare(`
          UPDATE messages SET
            finish_reason = 'error',
            error_type = 'server_restart',
            error_message = 'Server restarted while response was in progress',
            completed_at = ?
          WHERE role = 'assistant'
            AND completed_at IS NULL
        `).run(now);
        totalCleaned += result.changes;
      } catch {
        // Skip inaccessible project DBs
      }
    }

    if (totalCleaned > 0) {
      console.log(`🧹 Cleaned up ${totalCleaned} stale incomplete message(s) from previous run`);
    }
  } catch (error) {
    console.error("Failed to clean up stale messages:", error);
  }
}

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

  // Clean up stale incomplete messages from previous crashes
  // (assistant messages with completed_at IS NULL that will never complete)
  cleanupStaleMessages();

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

  console.log(`🚀 Botical server running at http://${hostname}:${port}`);
  console.log(`🔌 WebSocket available at ws://${hostname}:${port}/ws`);

  // Start auto-start services (don't await - let it run in background)
  ServiceRunner.startAutoServices().catch((error) => {
    console.error("Failed to start auto-start services:", error);
  });

  // Start the scheduler for recurring tasks
  Scheduler.start();

  // Start Telegram bot if configured
  startTelegramBot();

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
      // Stop Telegram bot
      stopTelegramBot();
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
