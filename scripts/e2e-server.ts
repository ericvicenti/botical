#!/usr/bin/env bun
/**
 * E2E Test Server Script
 *
 * Starts backend and frontend servers for e2e testing.
 * Used by Playwright's webServer config to ensure both servers are running.
 *
 * Usage:
 *   bun scripts/e2e-server.ts
 *
 * Environment variables:
 *   E2E_BACKEND_PORT  - Backend port (default: 4096)
 *   E2E_FRONTEND_PORT - Frontend port (default: 5173)
 */

import { spawn, type Subprocess } from "bun";
import { existsSync } from "fs";

const ROOT_DIR = import.meta.dir.replace("/scripts", "");
const WEBUI_DIR = `${ROOT_DIR}/webui`;

const BACKEND_PORT = parseInt(process.env.E2E_BACKEND_PORT || "4096", 10);
const FRONTEND_PORT = parseInt(process.env.E2E_FRONTEND_PORT || "5173", 10);

let backendProcess: Subprocess | null = null;
let frontendProcess: Subprocess | null = null;

async function waitForServer(url: string, timeout = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) return true;
    } catch {
      // Server not ready yet, keep waiting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function ensureDependencies(): Promise<void> {
  if (!existsSync(`${ROOT_DIR}/node_modules`)) {
    console.log("[e2e] Installing root dependencies...");
    const proc = spawn(["bun", "install"], {
      cwd: ROOT_DIR,
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  }

  if (!existsSync(`${WEBUI_DIR}/node_modules`)) {
    console.log("[e2e] Installing webui dependencies...");
    const proc = spawn(["bun", "install"], {
      cwd: WEBUI_DIR,
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  }
}

function shutdown(): void {
  console.log("\n[e2e] Shutting down servers...");
  frontendProcess?.kill();
  backendProcess?.kill();
  process.exit(0);
}

async function main(): Promise<void> {
  console.log("[e2e] Starting servers for e2e tests...");
  console.log(`[e2e] Backend:  http://localhost:${BACKEND_PORT}`);
  console.log(`[e2e] Frontend: http://localhost:${FRONTEND_PORT}`);

  await ensureDependencies();

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start backend server
  backendProcess = spawn(["bun", "run", "src/index.ts"], {
    cwd: ROOT_DIR,
    env: { ...process.env, IRIS_PORT: String(BACKEND_PORT) },
    stdout: "inherit",
    stderr: "inherit",
  });

  // Wait for backend to be ready (use health endpoint)
  console.log("[e2e] Waiting for backend...");
  const backendReady = await waitForServer(`http://localhost:${BACKEND_PORT}/health`, 30000);
  if (!backendReady) {
    console.error("[e2e] Backend failed to start");
    shutdown();
    return;
  }
  console.log("[e2e] Backend ready");

  // Start frontend server
  frontendProcess = spawn(["bun", "run", "dev", "--port", String(FRONTEND_PORT)], {
    cwd: WEBUI_DIR,
    env: {
      ...process.env,
      VITE_API_URL: `http://localhost:${BACKEND_PORT}`,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  // Wait for frontend to be ready
  console.log("[e2e] Waiting for frontend...");
  const frontendReady = await waitForServer(`http://localhost:${FRONTEND_PORT}`, 30000);
  if (!frontendReady) {
    console.error("[e2e] Frontend failed to start");
    shutdown();
    return;
  }
  console.log("[e2e] Frontend ready");
  console.log("[e2e] Servers are ready for e2e tests");

  // Keep process alive
  await Promise.race([backendProcess.exited, frontendProcess.exited]);
  shutdown();
}

main().catch((e) => {
  console.error("[e2e] Error:", e.message);
  process.exit(1);
});
