/**
 * PTY Process Manager
 *
 * Process management using a Node.js sidecar for full terminal emulation.
 * The sidecar runs node-pty since native modules don't work directly with Bun.
 *
 * Architecture:
 * - Main Bun process spawns a Node.js sidecar
 * - Sidecar handles PTY operations via node-pty
 * - Communication via stdin/stdout JSON messages
 *
 * See: docs/implementation-plan/11-process-management.md
 */

import type { Subprocess, FileSink } from "bun";
import * as path from "path";
import * as readline from "readline";
import { z } from "zod";

/**
 * Process creation options
 */
export interface ProcessOptions {
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  logPath?: string;
  onData: (data: string) => void;
  onExit: (code: number) => void;
}

/**
 * Pending process info
 */
interface PendingProcess {
  processId: string;
  options: ProcessOptions;
  command: string;
}

/**
 * Active process info
 */
interface ActiveProcess {
  processId: string;
  options: ProcessOptions;
  pid?: number;
}

/**
 * Message from sidecar
 */
const SidecarMessageSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  data: z.string().optional(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
  pid: z.number().optional(),
  cols: z.number().optional(),
  rows: z.number().optional(),
});

interface SidecarMessage {
  type: string;
  id?: string;
  data?: string;
  exitCode?: number;
  error?: string;
  pid?: number;
  cols?: number;
  rows?: number;
}

/**
 * PTY Process Manager class
 */
class PtyProcessManager {
  private sidecar: Subprocess | null = null;
  private sidecarReady = false;
  private pendingCreates: PendingProcess[] = [];
  private processes: Map<string, ActiveProcess> = new Map();
  private messageBuffer = "";

  constructor() {
    this.startSidecar();
  }

  /**
   * Start the Node.js sidecar process
   */
  private startSidecar(): void {
    const sidecarPath = path.join(
      import.meta.dir,
      "pty-sidecar",
      "index.js"
    );

    console.log("[PTY] Starting sidecar at:", sidecarPath);

    this.sidecar = Bun.spawn(["node", sidecarPath], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });

    // Handle sidecar output
    if (this.sidecar.stdout && typeof this.sidecar.stdout !== "number") {
      this.readSidecarOutput(this.sidecar.stdout);
    }

    // Handle sidecar exit
    this.sidecar.exited.then((code) => {
      console.log(`[PTY] Sidecar exited with code ${code}`);
      this.sidecarReady = false;
      this.sidecar = null;

      // Notify all active processes that they've exited
      for (const [processId, proc] of this.processes) {
        proc.options.onExit(-1);
      }
      this.processes.clear();

      // Restart sidecar after a delay
      setTimeout(() => this.startSidecar(), 1000);
    });
  }

  /**
   * Read and process sidecar stdout
   */
  private async readSidecarOutput(
    stdout: ReadableStream<Uint8Array>
  ): Promise<void> {
    const reader = stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        this.messageBuffer += decoder.decode(value);

        // Process complete lines
        const lines = this.messageBuffer.split("\n");
        this.messageBuffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const rawMessage = JSON.parse(line);
              const message = SidecarMessageSchema.parse(rawMessage);
              this.handleSidecarMessage(message);
            } catch (error) {
              console.error("[PTY] Failed to parse sidecar message:", line);
            }
          }
        }
      }
    } catch (error) {
      console.error("[PTY] Error reading sidecar output:", error);
    }
  }

  /**
   * Handle a message from the sidecar
   */
  private handleSidecarMessage(message: SidecarMessage): void {
    switch (message.type) {
      case "ready":
        console.log("[PTY] Sidecar is ready");
        this.sidecarReady = true;
        // Process any pending creates
        for (const pending of this.pendingCreates) {
          this.sendCreate(pending.processId, pending.command, pending.options);
        }
        this.pendingCreates = [];
        break;

      case "created":
        if (message.id) {
          const proc = this.processes.get(message.id);
          if (proc) {
            proc.pid = message.pid;
            console.log(
              `[PTY] Process ${message.id} created with PID ${message.pid}`
            );
          }
        }
        break;

      case "data":
        if (message.id && message.data !== undefined) {
          const proc = this.processes.get(message.id);
          if (proc) {
            proc.options.onData(message.data);
          }
        }
        break;

      case "exit":
        if (message.id) {
          const proc = this.processes.get(message.id);
          if (proc) {
            proc.options.onExit(message.exitCode ?? -1);
            this.processes.delete(message.id);
            console.log(
              `[PTY] Process ${message.id} exited with code ${message.exitCode}`
            );
          }
        }
        break;

      case "error":
        console.error(
          `[PTY] Sidecar error for ${message.id || "unknown"}:`,
          message.error
        );
        break;

      case "written":
      case "resized":
      case "killed":
      case "pong":
        // Acknowledgments - no action needed
        break;

      default:
        console.log("[PTY] Unknown sidecar message:", message);
    }
  }

  /**
   * Send a message to the sidecar
   */
  private sendToSidecar(message: object): void {
    if (this.sidecar?.stdin) {
      const stdin = this.sidecar.stdin as FileSink;
      const data = JSON.stringify(message) + "\n";
      stdin.write(new TextEncoder().encode(data));
      stdin.flush();
    }
  }

  /**
   * Send a create message to the sidecar
   */
  private sendCreate(
    processId: string,
    command: string,
    options: ProcessOptions
  ): void {
    this.sendToSidecar({
      type: "create",
      id: processId,
      command,
      cwd: options.cwd,
      env: options.env,
      cols: options.cols || 80,
      rows: options.rows || 24,
      logPath: options.logPath,
    });
  }

  /**
   * Create a new PTY process
   */
  create(processId: string, command: string, options: ProcessOptions): void {
    // Store the process
    this.processes.set(processId, {
      processId,
      options,
    });

    if (this.sidecarReady) {
      this.sendCreate(processId, command, options);
    } else {
      // Queue for when sidecar is ready
      this.pendingCreates.push({ processId, command, options });
      console.log(
        `[PTY] Queued process ${processId} - waiting for sidecar`
      );
    }
  }

  /**
   * Write data to process stdin
   */
  write(processId: string, data: string): boolean {
    if (!this.processes.has(processId)) {
      return false;
    }

    this.sendToSidecar({
      type: "write",
      id: processId,
      data,
    });

    return true;
  }

  /**
   * Resize the PTY terminal
   */
  resize(processId: string, cols: number, rows: number): boolean {
    if (!this.processes.has(processId)) {
      return false;
    }

    this.sendToSidecar({
      type: "resize",
      id: processId,
      cols,
      rows,
    });

    return true;
  }

  /**
   * Kill the process
   */
  kill(processId: string): boolean {
    if (!this.processes.has(processId)) {
      return false;
    }

    this.sendToSidecar({
      type: "kill",
      id: processId,
    });

    return true;
  }

  /**
   * Check if a process instance exists
   */
  exists(processId: string): boolean {
    return this.processes.has(processId);
  }

  /**
   * Get the PID of a process
   */
  getPid(processId: string): number | null {
    const proc = this.processes.get(processId);
    return proc?.pid ?? null;
  }

  /**
   * Get the count of active process instances
   */
  getActiveCount(): number {
    return this.processes.size;
  }

  /**
   * Get all active process IDs
   */
  getActiveIds(): string[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Clean up and remove a process instance
   */
  cleanup(processId: string): void {
    this.processes.delete(processId);
  }

  /**
   * Kill all process instances
   */
  killAll(): void {
    for (const processId of this.processes.keys()) {
      this.kill(processId);
    }
  }

  /**
   * Check if sidecar is ready
   */
  isReady(): boolean {
    return this.sidecarReady;
  }

  /**
   * Shutdown the sidecar
   */
  shutdown(): void {
    this.killAll();
    if (this.sidecar) {
      this.sidecar.kill();
      this.sidecar = null;
    }
  }
}

// Export singleton instance
export const ptyProcessManager = new PtyProcessManager();

// Export class for testing
export { PtyProcessManager };
