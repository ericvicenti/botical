#!/usr/bin/env node

/**
 * Iris AI - Run a local AI agent workspace with a single command
 *
 * Usage: npx iris-ai [options]
 *
 * This CLI will:
 * 1. Check if Bun is installed (required runtime)
 * 2. Download/update Iris to ~/.iris/app
 * 3. Build the web UI if needed
 * 4. Start the server and open your browser
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const IRIS_DIR = join(homedir(), ".iris");
const APP_DIR = join(IRIS_DIR, "app");
const REPO_URL = "https://github.com/ericvicenti/iris.git";
const VERSION = "0.1.0";

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function logStep(step, msg) {
  console.log(`${colors.cyan}[${step}]${colors.reset} ${msg}`);
}

function logError(msg) {
  console.error(`${colors.red}Error:${colors.reset} ${msg}`);
}

function logSuccess(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: options.silent ? "pipe" : "inherit",
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });

    let stdout = "";
    let stderr = "";

    if (options.silent) {
      proc.stdout?.on("data", (data) => (stdout += data));
      proc.stderr?.on("data", (data) => (stderr += data));
    }

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${cmd} ${args.join(" ")}`));
      }
    });

    proc.on("error", reject);
  });
}

async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function checkBun() {
  if (commandExists("bun")) {
    const version = execSync("bun --version", { encoding: "utf-8" }).trim();
    logSuccess(`Bun ${version} found`);
    return true;
  }
  return false;
}

async function installBun() {
  log("\nBun is required to run Iris.", colors.yellow);
  log("Bun is a fast JavaScript runtime with built-in SQLite support.\n");

  const answer = await prompt("Would you like to install Bun now? [Y/n] ");

  if (answer === "n" || answer === "no") {
    log("\nYou can install Bun manually:");
    log("  curl -fsSL https://bun.sh/install | bash", colors.cyan);
    log("\nThen run 'npx iris-ai' again.\n");
    process.exit(1);
  }

  logStep("1/5", "Installing Bun...");

  try {
    await runCommand("bash", ["-c", "curl -fsSL https://bun.sh/install | bash"]);
    logSuccess("Bun installed successfully");

    // Add bun to PATH for this session
    const bunPath = join(homedir(), ".bun", "bin");
    process.env.PATH = `${bunPath}:${process.env.PATH}`;

    return true;
  } catch (error) {
    logError("Failed to install Bun");
    log("\nPlease install Bun manually:");
    log("  curl -fsSL https://bun.sh/install | bash", colors.cyan);
    process.exit(1);
  }
}

async function downloadIris() {
  logStep("2/5", "Setting up Iris...");

  // Ensure .iris directory exists
  if (!existsSync(IRIS_DIR)) {
    mkdirSync(IRIS_DIR, { recursive: true });
  }

  if (existsSync(APP_DIR)) {
    // Check if it's a git repo and try to update
    if (existsSync(join(APP_DIR, ".git"))) {
      log("  Checking for updates...", colors.dim);
      try {
        await runCommand("git", ["fetch", "origin"], { cwd: APP_DIR, silent: true });
        const result = await runCommand("git", ["rev-list", "HEAD...origin/main", "--count"], {
          cwd: APP_DIR,
          silent: true,
        });
        const behindCount = parseInt(result.stdout.trim(), 10);

        if (behindCount > 0) {
          log(`  ${behindCount} update(s) available, pulling...`, colors.dim);
          await runCommand("git", ["pull", "origin", "main"], { cwd: APP_DIR, silent: true });
          logSuccess("Iris updated");
          return true; // Indicate that we updated
        } else {
          logSuccess("Iris is up to date");
          return false;
        }
      } catch {
        log("  Could not check for updates, using existing installation", colors.dim);
        return false;
      }
    } else {
      // Not a git repo, remove and re-clone
      log("  Removing corrupted installation...", colors.dim);
      rmSync(APP_DIR, { recursive: true, force: true });
    }
  }

  // Clone fresh
  log("  Downloading Iris...", colors.dim);
  try {
    await runCommand("git", ["clone", "--depth", "1", REPO_URL, APP_DIR]);
    logSuccess("Iris downloaded");
    return true;
  } catch (error) {
    logError("Failed to download Iris");
    throw error;
  }
}

async function installDependencies(forceInstall = false) {
  logStep("3/5", "Installing dependencies...");

  const nodeModulesExists = existsSync(join(APP_DIR, "node_modules"));
  const webuiNodeModulesExists = existsSync(join(APP_DIR, "webui", "node_modules"));

  if (!forceInstall && nodeModulesExists && webuiNodeModulesExists) {
    logSuccess("Dependencies already installed");
    return;
  }

  try {
    // Install root dependencies
    if (!nodeModulesExists || forceInstall) {
      log("  Installing backend dependencies...", colors.dim);
      await runCommand("bun", ["install"], { cwd: APP_DIR });
    }

    // Install webui dependencies
    if (!webuiNodeModulesExists || forceInstall) {
      log("  Installing frontend dependencies...", colors.dim);
      await runCommand("bun", ["install"], { cwd: join(APP_DIR, "webui") });
    }

    logSuccess("Dependencies installed");
  } catch (error) {
    logError("Failed to install dependencies");
    throw error;
  }
}

async function buildWebUI(forceBuild = false) {
  logStep("4/5", "Building web interface...");

  const distDir = join(APP_DIR, "webui", "dist");
  const distExists = existsSync(distDir);

  if (!forceBuild && distExists) {
    logSuccess("Web interface already built");
    return;
  }

  try {
    await runCommand("bun", ["run", "build"], { cwd: join(APP_DIR, "webui") });
    logSuccess("Web interface built");
  } catch (error) {
    logError("Failed to build web interface");
    throw error;
  }
}

async function findAvailablePort(startPort) {
  const net = await import("node:net");

  return new Promise((resolve) => {
    const server = net.default.createServer();
    server.listen(startPort, "localhost", () => {
      server.close(() => resolve(startPort));
    });
    server.on("error", () => {
      findAvailablePort(startPort + 1).then(resolve);
    });
  });
}

async function startServer(port) {
  logStep("5/5", "Starting Iris server...");

  const env = {
    NODE_ENV: "production",
    IRIS_PORT: String(port),
    IRIS_HOST: "localhost",
    IRIS_STATIC_DIR: join(APP_DIR, "webui", "dist"),
    IRIS_DATA_DIR: IRIS_DIR,
  };

  const url = `http://localhost:${port}`;

  log("");
  log("┌─────────────────────────────────────────┐", colors.cyan);
  log("│                                         │", colors.cyan);
  log("│   🌸 Iris AI Agent Workspace            │", colors.cyan);
  log("│                                         │", colors.cyan);
  log(`│   ${colors.bright}${url}${colors.reset}${colors.cyan}${" ".repeat(Math.max(0, 25 - url.length))}│`, colors.cyan);
  log("│                                         │", colors.cyan);
  log("│   Press Ctrl+C to stop                  │", colors.cyan);
  log("│                                         │", colors.cyan);
  log("└─────────────────────────────────────────┘", colors.cyan);
  log("");

  // Open browser after a short delay
  setTimeout(() => {
    try {
      const platform = process.platform;
      if (platform === "darwin") {
        execSync(`open "${url}"`, { stdio: "ignore" });
      } else if (platform === "win32") {
        execSync(`start "" "${url}"`, { stdio: "ignore" });
      } else {
        execSync(`xdg-open "${url}"`, { stdio: "ignore" });
      }
    } catch {
      // Browser open failed, that's ok
    }
  }, 1000);

  // Start the server (this blocks until the server exits)
  const bunPath = commandExists("bun") ? "bun" : join(homedir(), ".bun", "bin", "bun");

  const server = spawn(bunPath, ["run", "src/index.ts"], {
    cwd: APP_DIR,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    log("\n\nShutting down Iris...", colors.dim);
    server.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    server.kill("SIGTERM");
  });

  return new Promise((resolve, reject) => {
    server.on("close", (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Server exited with code ${code}`));
      }
    });
    server.on("error", reject);
  });
}

function showHelp() {
  log(`
${colors.cyan}${colors.bright}Iris AI${colors.reset} - Local AI Agent Workspace

${colors.bright}Usage:${colors.reset}
  npx iris-ai [options]

${colors.bright}Options:${colors.reset}
  --port, -p <port>   Specify port (default: 6001)
  --update            Force update Iris to latest version
  --rebuild           Force rebuild the web interface
  --help, -h          Show this help message
  --version, -v       Show version

${colors.bright}Examples:${colors.reset}
  npx iris-ai                 # Start Iris on default port
  npx iris-ai -p 8080         # Start on port 8080
  npx iris-ai --update        # Update and start

${colors.bright}Data Location:${colors.reset}
  ~/.iris/                    # All data stored here
  ~/.iris/app/                # Application files
  ~/.iris/projects/           # Your projects

${colors.bright}More Info:${colors.reset}
  https://github.com/ericvicenti/iris
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let requestedPort = null;
  let forceUpdate = false;
  let forceRebuild = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    }
    if (arg === "--version" || arg === "-v") {
      log(`iris-ai v${VERSION}`);
      process.exit(0);
    }
    if (arg === "--port" || arg === "-p") {
      requestedPort = parseInt(args[++i], 10);
      if (isNaN(requestedPort)) {
        logError("Invalid port number");
        process.exit(1);
      }
    }
    if (arg === "--update") {
      forceUpdate = true;
    }
    if (arg === "--rebuild") {
      forceRebuild = true;
    }
  }

  log("");
  log(`${colors.bright}${colors.magenta}🌸 Iris AI${colors.reset}`, colors.bright);
  log(`${colors.dim}v${VERSION}${colors.reset}`);
  log("");

  try {
    // Step 1: Check/install Bun
    const hasBun = await checkBun();
    if (!hasBun) {
      await installBun();
    }

    // Step 2: Download/update Iris
    const wasUpdated = await downloadIris();
    const needsInstall = wasUpdated || forceUpdate;

    // Step 3: Install dependencies
    await installDependencies(needsInstall);

    // Step 4: Build web UI
    await buildWebUI(needsInstall || forceRebuild);

    // Step 5: Find available port and start server
    const port = await findAvailablePort(requestedPort || 6001);
    if (requestedPort && port !== requestedPort) {
      log(`Port ${requestedPort} is in use, using ${port} instead`, colors.yellow);
    }
    await startServer(port);
  } catch (error) {
    logError(error.message);
    process.exit(1);
  }
}

main();
