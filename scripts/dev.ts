#!/usr/bin/env bun
/**
 * Iris Development Script
 *
 * Starts backend and frontend dev servers with auto-port selection.
 * Run with: bun dev
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

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (port < startPort + 100) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }
  throw new Error(`No available port found starting from ${startPort}`);
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

  const backendPort = await findAvailablePort(4096);
  const frontendPort = await findAvailablePort(5173);

  if (backendPort !== 4096) console.log(`Backend port 4096 in use, using ${backendPort}`);
  if (frontendPort !== 5173) console.log(`Frontend port 5173 in use, using ${frontendPort}`);

  console.log(`\nBackend:  http://localhost:${backendPort}`);
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
