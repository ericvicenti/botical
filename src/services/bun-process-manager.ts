/**
 * Bun Process Manager
 *
 * Process management using Bun's native spawn API.
 * This is a fallback for when node-pty isn't available or doesn't work.
 *
 * Note: This doesn't provide full PTY emulation (no terminal size control,
 * no raw mode), but works for basic command execution.
 */

import type { Subprocess, FileSink } from "bun";

/**
 * Process instance interface
 */
interface ProcessInstance {
  proc: Subprocess;
  processId: string;
  onData: (data: string) => void;
  onExit: (code: number) => void;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
}

/**
 * Process creation options
 */
export interface ProcessOptions {
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  onData: (data: string) => void;
  onExit: (code: number) => void;
}

/**
 * Bun Process Manager class
 */
class BunProcessManager {
  private instances: Map<string, ProcessInstance> = new Map();

  /**
   * Create a new process instance
   */
  create(processId: string, command: string, options: ProcessOptions): void {
    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    });

    const instance: ProcessInstance = {
      proc,
      processId,
      onData: options.onData,
      onExit: options.onExit,
      stdout: proc.stdout,
      stderr: proc.stderr,
    };

    this.instances.set(processId, instance);

    // Stream stdout
    if (proc.stdout) {
      this.streamOutput(proc.stdout, options.onData);
    }

    // Stream stderr
    if (proc.stderr) {
      this.streamOutput(proc.stderr, options.onData);
    }

    // Handle exit
    proc.exited.then((code) => {
      options.onExit(code);
      this.instances.delete(processId);
    });
  }

  /**
   * Stream output from a ReadableStream
   */
  private async streamOutput(
    stream: ReadableStream<Uint8Array>,
    onData: (data: string) => void
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        onData(decoder.decode(value));
      }
    } catch (error) {
      // Stream closed
    }
  }

  /**
   * Write data to process stdin
   */
  write(processId: string, data: string): boolean {
    const instance = this.instances.get(processId);
    if (instance && instance.proc.stdin) {
      // Bun's stdin is a FileSink when using stdin: "pipe"
      const stdin = instance.proc.stdin as FileSink;
      stdin.write(new TextEncoder().encode(data));
      return true;
    }
    return false;
  }

  /**
   * Resize is a no-op for Bun.spawn (no PTY support)
   */
  resize(processId: string, cols: number, rows: number): boolean {
    // Bun.spawn doesn't support terminal resizing
    return this.instances.has(processId);
  }

  /**
   * Kill the process
   */
  kill(processId: string): boolean {
    const instance = this.instances.get(processId);
    if (instance) {
      instance.proc.kill();
      this.instances.delete(processId);
      return true;
    }
    return false;
  }

  /**
   * Check if a process instance exists
   */
  exists(processId: string): boolean {
    return this.instances.has(processId);
  }

  /**
   * Get the PID of a process
   */
  getPid(processId: string): number | null {
    const instance = this.instances.get(processId);
    return instance ? instance.proc.pid : null;
  }

  /**
   * Get the count of active process instances
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
   * Clean up and remove a process instance
   */
  cleanup(processId: string): void {
    this.instances.delete(processId);
  }

  /**
   * Kill all process instances
   */
  killAll(): void {
    for (const [processId, instance] of this.instances) {
      instance.proc.kill();
    }
    this.instances.clear();
  }
}

// Export singleton instance
export const bunProcessManager = new BunProcessManager();

// Export class for testing
export { BunProcessManager };
