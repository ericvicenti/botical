#!/usr/bin/env node
/**
 * PTY Sidecar Process
 *
 * A Node.js sidecar process that handles PTY operations for the Bun main process.
 * Communicates via stdin/stdout using newline-delimited JSON messages.
 *
 * Protocol:
 * - Input (stdin): JSON messages with { type, id, ...payload }
 * - Output (stdout): JSON messages with { type, id, ...payload }
 *
 * Message types:
 * - create: Create a new PTY process
 * - write: Write data to PTY stdin
 * - resize: Resize PTY terminal
 * - kill: Kill a PTY process
 * - data: PTY output data (outbound only)
 * - exit: PTY process exited (outbound only)
 * - error: Error occurred (outbound only)
 * - ready: Sidecar is ready (outbound only)
 */

const pty = require("node-pty");
const os = require("os");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Store active PTY processes
const processes = new Map();

// Get the shell to use
function getShell() {
  if (os.platform() === "win32") {
    return "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

// Send a message to the parent process
function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

// Handle incoming messages
function handleMessage(message) {
  const { type, id, ...payload } = message;

  switch (type) {
    case "create":
      handleCreate(id, payload);
      break;
    case "write":
      handleWrite(id, payload);
      break;
    case "resize":
      handleResize(id, payload);
      break;
    case "kill":
      handleKill(id);
      break;
    case "ping":
      send({ type: "pong", id });
      break;
    default:
      send({ type: "error", id, error: `Unknown message type: ${type}` });
  }
}

// Create a new PTY process
function handleCreate(processId, { command, cwd, env, cols, rows, logPath }) {
  if (processes.has(processId)) {
    send({ type: "error", id: processId, error: "Process already exists" });
    return;
  }

  const shell = getShell();
  const effectiveCols = cols || 80;
  const effectiveRows = rows || 24;

  // Set up log file if path is provided
  let logFile = null;
  if (logPath) {
    try {
      const logDir = path.dirname(logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      logFile = fs.openSync(logPath, "a");
      const header = `[${new Date().toISOString()}] Process started: ${command}\n`;
      fs.writeSync(logFile, header);
    } catch (error) {
      console.error(`Failed to open log file ${logPath}:`, error);
    }
  }

  try {
    // Use -i for interactive mode and -c to run the command
    // This ensures the shell properly initializes terminal capabilities
    const ptyProcess = pty.spawn(shell, ["-i", "-c", command], {
      name: "xterm-256color",
      cols: effectiveCols,
      rows: effectiveRows,
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        ...env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "1",
        CLICOLOR: "1",
        CLICOLOR_FORCE: "1",
        // Tell programs they're in an interactive terminal
        PS1: "$ ",
        SHELL: shell,
      },
    });

    processes.set(processId, { pty: ptyProcess, logFile });

    // Handle data output
    ptyProcess.onData((data) => {
      send({ type: "data", id: processId, data });

      // Write to log file if available
      if (logFile) {
        try {
          fs.writeSync(logFile, data);
        } catch (error) {
          // Ignore write errors
        }
      }
    });

    // Handle exit
    ptyProcess.onExit(({ exitCode }) => {
      // Write exit log
      if (logFile) {
        try {
          const footer = `\n[${new Date().toISOString()}] Process exited with code ${exitCode}\n`;
          fs.writeSync(logFile, footer);
          fs.closeSync(logFile);
        } catch (error) {
          // Ignore close errors
        }
      }

      send({ type: "exit", id: processId, exitCode });
      processes.delete(processId);
    });

    send({
      type: "created",
      id: processId,
      pid: ptyProcess.pid,
      cols: effectiveCols,
      rows: effectiveRows,
    });
  } catch (error) {
    send({ type: "error", id: processId, error: error.message });
  }
}

// Write data to PTY stdin
function handleWrite(processId, { data }) {
  const instance = processes.get(processId);
  if (instance) {
    instance.pty.write(data);
    send({ type: "written", id: processId });
  } else {
    send({ type: "error", id: processId, error: "Process not found" });
  }
}

// Resize PTY terminal
function handleResize(processId, { cols, rows }) {
  const instance = processes.get(processId);
  if (instance) {
    try {
      instance.pty.resize(cols, rows);
      send({ type: "resized", id: processId, cols, rows });
    } catch (error) {
      send({ type: "error", id: processId, error: error.message });
    }
  } else {
    send({ type: "error", id: processId, error: "Process not found" });
  }
}

// Kill a PTY process
function handleKill(processId) {
  const instance = processes.get(processId);
  if (instance) {
    // Close log file if open
    if (instance.logFile) {
      try {
        const footer = `\n[${new Date().toISOString()}] Process killed\n`;
        fs.writeSync(instance.logFile, footer);
        fs.closeSync(instance.logFile);
      } catch (error) {
        // Ignore close errors
      }
    }

    instance.pty.kill();
    processes.delete(processId);
    send({ type: "killed", id: processId });
  } else {
    send({ type: "error", id: processId, error: "Process not found" });
  }
}

// Set up stdin reading
const rl = readline.createInterface({
  input: process.stdin,
  output: null,
  terminal: false,
});

rl.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    handleMessage(message);
  } catch (error) {
    send({ type: "error", error: `Failed to parse message: ${error.message}` });
  }
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  for (const [processId, instance] of processes) {
    try {
      instance.pty.kill();
    } catch (error) {
      // Ignore
    }
  }
  process.exit(0);
});

process.on("SIGINT", () => {
  for (const [processId, instance] of processes) {
    try {
      instance.pty.kill();
    } catch (error) {
      // Ignore
    }
  }
  process.exit(0);
});

// Signal ready
send({ type: "ready" });
