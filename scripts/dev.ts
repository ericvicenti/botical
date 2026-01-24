#!/usr/bin/env bun
/**
 * Iris Development Script
 *
 * Starts backend and frontend dev servers with auto-port selection.
 * Run with: bun dev
 *
 * Port scheme: XX01 (backend) and XX02 (frontend)
 * - First instance: 6001 (backend), 6002 (frontend)
 * - Second instance: 6101 (backend), 6102 (frontend)
 * - Third instance: 6201 (backend), 6202 (frontend)
 */

import { spawn, type Subprocess } from "bun";
import { existsSync } from "fs";
import { createServer } from "net";

const ROOT_DIR = import.meta.dir.replace("/scripts", "");
const WEBUI_DIR = `${ROOT_DIR}/webui`;

let backendProcess: Subprocess | null = null;
let frontendProcess: Subprocess | null = null;

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Find an available port pair for backend (XX01) and frontend (XX02).
 * Starts at base 60 (6001/6002) and increments (6101/6102, 6201/6202, etc.)
 */
async function findAvailablePortPair(): Promise<{ backend: number; frontend: number }> {
  let base = 60;
  const maxBase = 99;

  while (base <= maxBase) {
    const backendPort = base * 100 + 1;  // XX01
    const frontendPort = base * 100 + 2; // XX02

    const backendAvailable = await isPortAvailable(backendPort);
    const frontendAvailable = await isPortAvailable(frontendPort);

    if (backendAvailable && frontendAvailable) {
      return { backend: backendPort, frontend: frontendPort };
    }

    base++;
  }

  throw new Error("No available port pair found (tried 6001-9901)");
}

async function ensureDependencies(): Promise<void> {
  if (!existsSync(`${ROOT_DIR}/node_modules`)) {
    console.log("Installing root dependencies...");
    const proc = spawn(["bun", "install"], { cwd: ROOT_DIR, stdout: "inherit", stderr: "inherit" });
    await proc.exited;
  }

  if (!existsSync(`${WEBUI_DIR}/node_modules`)) {
    console.log("Installing webui dependencies...");
    const proc = spawn(["bun", "install"], { cwd: WEBUI_DIR, stdout: "inherit", stderr: "inherit" });
    await proc.exited;
  }
}

function shutdown(): void {
  console.log("\nShutting down...");
  frontendProcess?.kill();
  backendProcess?.kill();
  process.exit(0);
}

async function main(): Promise<void> {
  console.log("\n🔷 Iris Dev\n");

  await ensureDependencies();

  const ports = await findAvailablePortPair();
  const backendPort = ports.backend;
  const frontendPort = ports.frontend;

  console.log(`Backend:  http://localhost:${backendPort}`);
  console.log(`Frontend: http://localhost:${frontendPort}\n`);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start backend
  backendProcess = spawn(["bun", "run", "--hot", "src/index.ts"], {
    cwd: ROOT_DIR,
    env: { ...process.env, IRIS_PORT: String(backendPort) },
    stdout: "inherit",
    stderr: "inherit",
  });

  // Start frontend
  frontendProcess = spawn(["bun", "run", "dev", "--port", String(frontendPort)], {
    cwd: WEBUI_DIR,
    env: { ...process.env, VITE_API_PORT: String(backendPort) },
    stdout: "inherit",
    stderr: "inherit",
  });

  // Open browser after a short delay
  setTimeout(() => {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    spawn([cmd, `http://localhost:${frontendPort}`], { stdout: "ignore", stderr: "ignore" });
  }, 2000);

  // Wait for either to exit
  await Promise.race([backendProcess.exited, frontendProcess.exited]);
  shutdown();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
