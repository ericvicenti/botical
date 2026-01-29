/**
 * Extension Server Manager
 *
 * Manages the lifecycle of extension server processes.
 * Each extension runs as a separate Bun process on its own port.
 */

import { spawn, type Subprocess } from "bun";
import * as path from "path";
import { ExtensionRegistry } from "./registry.ts";
import type { ExtensionDefinition, ExtensionServerState } from "./types.ts";

// Base port for extension servers
const EXTENSION_BASE_PORT = 4101;

// Track running processes
const runningProcesses = new Map<string, Subprocess>();

/**
 * Find an available port starting from a base port
 */
async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  const maxAttempts = 100;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Try to create a server on this port
      const server = Bun.serve({
        port,
        fetch: () => new Response(""),
      });
      server.stop();
      return port;
    } catch {
      port++;
    }
  }

  throw new Error(`Could not find available port after ${maxAttempts} attempts`);
}

/**
 * Get the directory path for an extension
 */
function getExtensionDir(extensionId: string): string {
  // Extensions are in src/extensions/{id}/
  return path.join(import.meta.dir, extensionId);
}

/**
 * Start an extension server
 */
export async function startExtensionServer(
  extension: ExtensionDefinition
): Promise<ExtensionServerState> {
  const { id, defaultPort, serverEntry } = extension;

  // Check if already running
  if (runningProcesses.has(id)) {
    const state = ExtensionRegistry.getServerState(id);
    if (state?.status === "running") {
      console.log(`[ExtensionManager] Extension ${id} is already running on port ${state.port}`);
      return state;
    }
  }

  // Find available port
  const port = await findAvailablePort(defaultPort || EXTENSION_BASE_PORT);

  // Update state to starting
  const startingState: ExtensionServerState = {
    extensionId: id,
    pid: null,
    port,
    status: "starting",
  };
  ExtensionRegistry.setServerState(id, startingState);

  try {
    const extensionDir = getExtensionDir(id);
    const serverPath = path.join(extensionDir, serverEntry);

    console.log(`[ExtensionManager] Starting extension ${id} on port ${port}`);
    console.log(`[ExtensionManager] Server path: ${serverPath}`);

    // Spawn the extension server process
    const proc = spawn({
      cmd: ["bun", "run", serverPath],
      env: {
        ...process.env,
        EXTENSION_PORT: String(port),
        EXTENSION_ID: id,
      },
      cwd: extensionDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    runningProcesses.set(id, proc);

    // Handle stdout
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = new TextDecoder().decode(value);
            console.log(`[${id}] ${text.trim()}`);
          }
        } catch {
          // Process ended
        }
      })();
    }

    // Handle stderr
    if (proc.stderr) {
      const reader = proc.stderr.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = new TextDecoder().decode(value);
            console.error(`[${id}] ${text.trim()}`);
          }
        } catch {
          // Process ended
        }
      })();
    }

    // Wait a bit for the server to start
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if process is still running
    if (proc.exitCode !== null) {
      throw new Error(`Extension server exited with code ${proc.exitCode}`);
    }

    // Update state to running
    const runningState: ExtensionServerState = {
      extensionId: id,
      pid: proc.pid,
      port,
      status: "running",
      startedAt: Date.now(),
    };
    ExtensionRegistry.setServerState(id, runningState);

    console.log(`[ExtensionManager] Extension ${id} started successfully on port ${port}`);
    return runningState;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ExtensionManager] Failed to start extension ${id}:`, errorMessage);

    const errorState: ExtensionServerState = {
      extensionId: id,
      pid: null,
      port,
      status: "error",
      error: errorMessage,
    };
    ExtensionRegistry.setServerState(id, errorState);

    // Clean up
    runningProcesses.delete(id);

    return errorState;
  }
}

/**
 * Stop an extension server
 */
export async function stopExtensionServer(extensionId: string): Promise<void> {
  const proc = runningProcesses.get(extensionId);

  if (!proc) {
    console.log(`[ExtensionManager] Extension ${extensionId} is not running`);
    ExtensionRegistry.clearServerState(extensionId);
    return;
  }

  console.log(`[ExtensionManager] Stopping extension ${extensionId}`);

  try {
    proc.kill();
    await proc.exited;
  } catch {
    // Process may already be dead
  }

  runningProcesses.delete(extensionId);

  const stoppedState: ExtensionServerState = {
    extensionId,
    pid: null,
    port: 0,
    status: "stopped",
  };
  ExtensionRegistry.setServerState(extensionId, stoppedState);

  console.log(`[ExtensionManager] Extension ${extensionId} stopped`);
}

/**
 * Stop all extension servers
 */
export async function stopAllExtensionServers(): Promise<void> {
  const extensionIds = Array.from(runningProcesses.keys());

  console.log(`[ExtensionManager] Stopping ${extensionIds.length} extension servers`);

  await Promise.all(extensionIds.map((id) => stopExtensionServer(id)));
}

/**
 * Restart an extension server
 */
export async function restartExtensionServer(
  extensionId: string
): Promise<ExtensionServerState | null> {
  const extension = ExtensionRegistry.get(extensionId);

  if (!extension) {
    console.error(`[ExtensionManager] Extension ${extensionId} not found`);
    return null;
  }

  await stopExtensionServer(extensionId);
  return startExtensionServer(extension);
}

/**
 * Start extension servers for enabled extensions in a project
 */
export async function startEnabledExtensions(
  enabledExtensionIds: string[]
): Promise<Map<string, ExtensionServerState>> {
  const states = new Map<string, ExtensionServerState>();

  for (const extensionId of enabledExtensionIds) {
    const extension = ExtensionRegistry.get(extensionId);

    if (!extension) {
      console.warn(`[ExtensionManager] Extension ${extensionId} is not registered, skipping`);
      continue;
    }

    const state = await startExtensionServer(extension);
    states.set(extensionId, state);
  }

  return states;
}

/**
 * Get the URL for an extension server
 */
export function getExtensionServerUrl(extensionId: string): string | null {
  const port = ExtensionRegistry.getServerPort(extensionId);
  if (!port) return null;
  return `http://localhost:${port}`;
}
