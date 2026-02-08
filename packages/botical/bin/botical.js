#!/usr/bin/env node

/**
 * Iris AI - Run a local AI agent workspace with a single command
 *
 * Usage: npx iris-ai [options]
 *
 * This CLI will:
 * 1. Check if Bun is installed (required runtime)
 * 2. Download/update Iris from GitHub
 * 3. Install dependencies and build if needed
 * 4. Start the server and open your browser
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const IRIS_DIR = join(homedir(), ".iris");
const APP_DIR = join(IRIS_DIR, "app");
const REPO_URL = "https://github.com/ericvicenti/iris.git";
const VERSION = "0.1.1";

// ═══════════════════════════════════════════════════════════════════════════
// Terminal styling
// ═══════════════════════════════════════════════════════════════════════════

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",

  // Colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Bright colors
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  // Background
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

// Symbols
const sym = {
  check: "✓",
  cross: "✗",
  arrow: "→",
  dot: "•",
  flower: "🌸",
  sparkle: "✨",
  rocket: "🚀",
  globe: "🌐",
  folder: "📁",
  gear: "⚙️",
  package: "📦",
  warning: "⚠️",
  info: "ℹ",
};

// Spinner frames
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

class Spinner {
  constructor(text) {
    this.text = text;
    this.frame = 0;
    this.interval = null;
  }

  start() {
    process.stdout.write("\x1b[?25l"); // Hide cursor
    this.interval = setInterval(() => {
      const frame = spinnerFrames[this.frame % spinnerFrames.length];
      process.stdout.write(`\r${c.cyan}${frame}${c.reset} ${this.text}`);
      this.frame++;
    }, 80);
    return this;
  }

  update(text) {
    this.text = text;
  }

  succeed(text) {
    this.stop();
    console.log(`\r${c.green}${sym.check}${c.reset} ${text || this.text}`);
  }

  fail(text) {
    this.stop();
    console.log(`\r${c.red}${sym.cross}${c.reset} ${text || this.text}`);
  }

  warn(text) {
    this.stop();
    console.log(`\r${c.yellow}${sym.warning}${c.reset} ${text || this.text}`);
  }

  info(text) {
    this.stop();
    console.log(`\r${c.blue}${sym.info}${c.reset} ${text || this.text}`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write("\x1b[?25h"); // Show cursor
    process.stdout.write("\r\x1b[K"); // Clear line
  }
}

function spinner(text) {
  return new Spinner(text).start();
}

function log(msg = "") {
  console.log(msg);
}

function logError(msg) {
  console.error(`${c.red}${c.bold}Error:${c.reset} ${msg}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

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
        reject(new Error(`Command failed with code ${code}`));
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

async function isOnline() {
  try {
    await runCommand("git", ["ls-remote", "--exit-code", "-h", REPO_URL], {
      silent: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    });
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Setup steps
// ═══════════════════════════════════════════════════════════════════════════

async function checkBun() {
  const s = spinner("Checking for Bun runtime...");

  if (commandExists("bun")) {
    const version = execSync("bun --version", { encoding: "utf-8" }).trim();
    s.succeed(`Bun ${c.dim}v${version}${c.reset} ready`);
    return true;
  }

  s.warn("Bun not found");
  return false;
}

async function installBun() {
  log();
  log(`${c.yellow}Bun is required to run Iris.${c.reset}`);
  log(`${c.dim}Bun is a fast JavaScript runtime with built-in SQLite support.${c.reset}`);
  log();

  const answer = await prompt(`${c.cyan}?${c.reset} Install Bun now? ${c.dim}(Y/n)${c.reset} `);

  if (answer === "n" || answer === "no") {
    log();
    log(`Install Bun manually: ${c.cyan}curl -fsSL https://bun.sh/install | bash${c.reset}`);
    log(`Then run ${c.cyan}npx iris-ai${c.reset} again.`);
    log();
    process.exit(1);
  }

  const s = spinner("Installing Bun...");

  try {
    await runCommand("bash", ["-c", "curl -fsSL https://bun.sh/install | bash"], { silent: true });

    // Add bun to PATH for this session
    const bunPath = join(homedir(), ".bun", "bin");
    process.env.PATH = `${bunPath}:${process.env.PATH}`;

    s.succeed("Bun installed");
    return true;
  } catch (error) {
    s.fail("Failed to install Bun");
    log();
    log(`Install manually: ${c.cyan}curl -fsSL https://bun.sh/install | bash${c.reset}`);
    process.exit(1);
  }
}

async function syncIris() {
  const s = spinner("Syncing with GitHub...");

  // Ensure .iris directory exists
  if (!existsSync(IRIS_DIR)) {
    mkdirSync(IRIS_DIR, { recursive: true });
  }

  // Check if we have an existing installation
  const hasExisting = existsSync(APP_DIR) && existsSync(join(APP_DIR, ".git"));

  if (hasExisting) {
    // Try to pull latest changes
    try {
      // Check if online first (with a quick timeout)
      const online = await Promise.race([
        isOnline(),
        new Promise((resolve) => setTimeout(() => resolve(false), 5000))
      ]);

      if (!online) {
        s.info(`Offline mode ${c.dim}(using cached version)${c.reset}`);
        return { updated: false, offline: true };
      }

      s.update("Fetching updates...");
      await runCommand("git", ["fetch", "origin", "main"], { cwd: APP_DIR, silent: true });

      // Check if we're behind
      const result = await runCommand("git", ["rev-list", "HEAD...origin/main", "--count"], {
        cwd: APP_DIR,
        silent: true,
      });
      const behindCount = parseInt(result.stdout.trim(), 10);

      if (behindCount > 0) {
        s.update(`Pulling ${behindCount} update${behindCount > 1 ? "s" : ""}...`);
        await runCommand("git", ["pull", "--ff-only", "origin", "main"], { cwd: APP_DIR, silent: true });
        s.succeed(`Updated ${c.dim}(${behindCount} new commit${behindCount > 1 ? "s" : ""})${c.reset}`);
        return { updated: true, offline: false };
      } else {
        s.succeed(`Up to date ${c.dim}(no changes)${c.reset}`);
        return { updated: false, offline: false };
      }
    } catch (error) {
      // Git operation failed - might be offline or other issue
      s.info(`Using cached version ${c.dim}(couldn't sync)${c.reset}`);
      return { updated: false, offline: true };
    }
  } else {
    // Need to clone fresh
    if (existsSync(APP_DIR)) {
      // Remove incomplete installation
      rmSync(APP_DIR, { recursive: true, force: true });
    }

    // Check if online
    const online = await Promise.race([
      isOnline(),
      new Promise((resolve) => setTimeout(() => resolve(false), 5000))
    ]);

    if (!online) {
      s.fail("No cached version found and offline");
      log();
      log(`${c.yellow}Please connect to the internet for the initial download.${c.reset}`);
      log();
      process.exit(1);
    }

    s.update("Downloading Iris...");
    try {
      await runCommand("git", ["clone", "--depth", "1", REPO_URL, APP_DIR], { silent: true });
      s.succeed("Downloaded Iris");
      return { updated: true, offline: false, fresh: true };
    } catch (error) {
      s.fail("Failed to download Iris");
      throw error;
    }
  }
}

async function installDependencies(forceInstall = false) {
  const nodeModulesExists = existsSync(join(APP_DIR, "node_modules"));
  const webuiNodeModulesExists = existsSync(join(APP_DIR, "webui", "node_modules"));
  const needsInstall = forceInstall || !nodeModulesExists || !webuiNodeModulesExists;

  if (!needsInstall) {
    const s = spinner("Checking dependencies...");
    s.succeed(`Dependencies ready`);
    return;
  }

  const s = spinner("Installing dependencies...");

  try {
    if (!nodeModulesExists || forceInstall) {
      s.update("Installing backend packages...");
      await runCommand("bun", ["install"], { cwd: APP_DIR, silent: true });
    }

    if (!webuiNodeModulesExists || forceInstall) {
      s.update("Installing frontend packages...");
      await runCommand("bun", ["install"], { cwd: join(APP_DIR, "webui"), silent: true });
    }

    s.succeed("Dependencies installed");
  } catch (error) {
    s.fail("Failed to install dependencies");
    throw error;
  }
}

async function buildWebUI(forceBuild = false) {
  const distDir = join(APP_DIR, "webui", "dist");
  const distExists = existsSync(distDir);

  if (!forceBuild && distExists) {
    const s = spinner("Checking build...");
    s.succeed("Build ready");
    return;
  }

  const s = spinner("Building web interface...");

  try {
    await runCommand("bun", ["run", "build"], { cwd: join(APP_DIR, "webui"), silent: true });
    s.succeed("Build complete");
  } catch (error) {
    s.fail("Build failed");
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

function printBanner(url) {
  const line = "─".repeat(45);

  log();
  log(`${c.magenta}${c.bold}  ${sym.flower} Iris AI Agent Workspace${c.reset}`);
  log(`${c.dim}  ${line}${c.reset}`);
  log();
  log(`  ${c.brightWhite}${c.bold}${url}${c.reset}`);
  log();
  log(`  ${c.dim}${sym.arrow} Press ${c.reset}${c.bold}Ctrl+C${c.reset}${c.dim} to stop${c.reset}`);
  log(`  ${c.dim}${sym.arrow} Data stored in ${c.reset}${c.cyan}~/.iris/${c.reset}`);
  log();
  log(`${c.dim}  ${line}${c.reset}`);
  log();
}

async function startServer(port) {
  const env = {
    NODE_ENV: "production",
    IRIS_PORT: String(port),
    IRIS_HOST: "localhost",
    IRIS_STATIC_DIR: join(APP_DIR, "webui", "dist"),
    IRIS_DATA_DIR: IRIS_DIR,
    IRIS_SINGLE_USER: "true",
  };

  const url = `http://localhost:${port}`;

  printBanner(url);

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
  }, 800);

  // Start the server
  const bunPath = commandExists("bun") ? "bun" : join(homedir(), ".bun", "bin", "bun");

  const server = spawn(bunPath, ["run", "src/index.ts"], {
    cwd: APP_DIR,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

  // Handle graceful shutdown
  const shutdown = () => {
    log();
    log(`${c.dim}Shutting down...${c.reset}`);
    server.kill("SIGINT");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

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
${c.magenta}${c.bold}${sym.flower} Iris AI${c.reset} ${c.dim}v${VERSION}${c.reset}
${c.dim}Local AI Agent Workspace${c.reset}

${c.bold}Usage:${c.reset}
  npx iris-ai ${c.dim}[options]${c.reset}

${c.bold}Options:${c.reset}
  ${c.cyan}-p, --port${c.reset} <port>   Use specific port ${c.dim}(default: 6001)${c.reset}
  ${c.cyan}--offline${c.reset}           Skip update check
  ${c.cyan}--rebuild${c.reset}           Force rebuild web interface
  ${c.cyan}-h, --help${c.reset}          Show this help
  ${c.cyan}-v, --version${c.reset}       Show version

${c.bold}Examples:${c.reset}
  ${c.dim}$${c.reset} npx iris-ai              ${c.dim}# Start on default port${c.reset}
  ${c.dim}$${c.reset} npx iris-ai -p 8080      ${c.dim}# Start on port 8080${c.reset}
  ${c.dim}$${c.reset} npx iris-ai --offline    ${c.dim}# Skip updates${c.reset}

${c.bold}Data:${c.reset}
  ${c.cyan}~/.iris/${c.reset}              ${c.dim}All data stored here${c.reset}
  ${c.cyan}~/.iris/app/${c.reset}          ${c.dim}Application files${c.reset}
  ${c.cyan}~/.iris/projects/${c.reset}     ${c.dim}Your projects${c.reset}

${c.dim}More info: https://github.com/ericvicenti/iris${c.reset}
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let requestedPort = null;
  let skipSync = false;
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
    if (arg === "--offline") {
      skipSync = true;
    }
    if (arg === "--rebuild") {
      forceRebuild = true;
    }
  }

  // Header
  log();
  log(`${c.magenta}${c.bold}  ${sym.flower} Iris AI${c.reset} ${c.dim}v${VERSION}${c.reset}`);
  log();

  try {
    // Step 1: Check/install Bun
    const hasBun = await checkBun();
    if (!hasBun) {
      await installBun();
    }

    // Step 2: Sync with GitHub (git pull)
    let syncResult = { updated: false, offline: false, fresh: false };
    if (!skipSync) {
      syncResult = await syncIris();
    } else {
      const s = spinner("Skipping sync...");
      s.info("Sync skipped ${c.dim}(--offline)${c.reset}");
    }

    // Step 3: Install dependencies (if updated or missing)
    await installDependencies(syncResult.updated || syncResult.fresh);

    // Step 4: Build web UI (if updated or missing)
    await buildWebUI(syncResult.updated || syncResult.fresh || forceRebuild);

    // Step 5: Find available port and start server
    const port = await findAvailablePort(requestedPort || 6001);
    if (requestedPort && port !== requestedPort) {
      log(`${c.yellow}${sym.warning}${c.reset} Port ${requestedPort} in use, using ${port}`);
    }

    await startServer(port);
  } catch (error) {
    logError(error.message);
    process.exit(1);
  }
}

main();
