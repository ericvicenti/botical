/**
 * PTY Manager
 *
 * Manages pseudo-terminal instances for process execution.
 * Uses node-pty for full terminal emulation, allowing interactive
 * input and proper signal handling.
 *
 * See: docs/implementation-plan/11-process-management.md
 */

import * as pty from "node-pty";

/**
 * PTY instance interface
 */
interface PTYInstance {
  pty: pty.IPty;
  processId: string;
  onData: (data: string) => void;
  onExit: (code: number) => void;
}

/**
 * PTY creation options
 */
export interface PTYOptions {
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  onData: (data: string) => void;
  onExit: (code: number) => void;
}

/**
 * PTY Manager class
 *
 * Manages the lifecycle of PTY instances:
 * - create: Spawn a new PTY process
 * - write: Send data to PTY stdin
 * - resize: Resize the PTY terminal
 * - kill: Terminate the PTY process
 */
class PTYManager {
  private instances: Map<string, PTYInstance> = new Map();

  /**
   * Create a new PTY instance
   */
  create(processId: string, command: string, options: PTYOptions): void {
    // Use bash on Unix-like systems, powershell on Windows
    const shell = process.platform === "win32" ? "powershell.exe" : "bash";
    const args = process.platform === "win32" ? ["-Command", command] : ["-c", command];

    const ptyProcess = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd,
      env: { ...process.env, ...options.env } as Record<string, string>,
    });

    ptyProcess.onData(options.onData);
    ptyProcess.onExit(({ exitCode }) => options.onExit(exitCode));

    this.instances.set(processId, {
      pty: ptyProcess,
      processId,
      onData: options.onData,
      onExit: options.onExit,
    });
  }

  /**
   * Write data to PTY stdin
   */
  write(processId: string, data: string): boolean {
    const instance = this.instances.get(processId);
    if (instance) {
      instance.pty.write(data);
      return true;
    }
    return false;
  }

  /**
   * Resize the PTY terminal
   */
  resize(processId: string, cols: number, rows: number): boolean {
    const instance = this.instances.get(processId);
    if (instance) {
      instance.pty.resize(cols, rows);
      return true;
    }
    return false;
  }

  /**
   * Kill the PTY process
   */
  kill(processId: string): boolean {
    const instance = this.instances.get(processId);
    if (instance) {
      instance.pty.kill();
      this.instances.delete(processId);
      return true;
    }
    return false;
  }

  /**
   * Check if a PTY instance exists
   */
  exists(processId: string): boolean {
    return this.instances.has(processId);
  }

  /**
   * Get the PID of a PTY process
   */
  getPid(processId: string): number | null {
    const instance = this.instances.get(processId);
    return instance ? instance.pty.pid : null;
  }

  /**
   * Get the count of active PTY instances
   */
  getActiveCount(): number {
    return this.instances.size;
  }

  /**
   * Get all active process IDs
   */
  getActiveIds(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Clean up and remove a PTY instance (called after exit)
   */
  cleanup(processId: string): void {
    this.instances.delete(processId);
  }

  /**
   * Kill all PTY instances
   */
  killAll(): void {
    for (const [processId, instance] of this.instances) {
      instance.pty.kill();
    }
    this.instances.clear();
  }
}

// Export singleton instance
export const ptyManager = new PTYManager();

// Export class for testing
export { PTYManager };
