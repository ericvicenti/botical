/**
 * Shell Actions
 *
 * Actions for executing shell commands and managing services.
 */

import { z } from "zod";
import { spawn } from "child_process";
import { defineAction, success, error } from "./types.ts";
import { DatabaseManager } from "@/database/index.ts";
import { ProcessService } from "@/services/processes.ts";

const DEFAULT_TIMEOUT = 120000; // 2 minutes
const MAX_TIMEOUT = 600000; // 10 minutes
const MAX_OUTPUT_LENGTH = 30000;

/**
 * Execute a command with timeout and output limits
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeout: number,
  abortSignal?: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn(command, {
      shell: true,
      cwd,
      env: { ...process.env, TERM: "dumb", NO_COLOR: "1" },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const abortHandler = () => proc.kill("SIGTERM");
    abortSignal?.addEventListener("abort", abortHandler);

    proc.stdout.on("data", (data: Buffer) => {
      if (stdout.length < MAX_OUTPUT_LENGTH) stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      if (stderr.length < MAX_OUTPUT_LENGTH) stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000);
    }, timeout);

    proc.on("close", (exitCode) => {
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener("abort", abortHandler);

      if (stdout.length > MAX_OUTPUT_LENGTH) stdout = stdout.slice(0, MAX_OUTPUT_LENGTH) + "\n... (truncated)";
      if (stderr.length > MAX_OUTPUT_LENGTH) stderr = stderr.slice(0, MAX_OUTPUT_LENGTH) + "\n... (truncated)";

      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode ?? 1, timedOut });
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener("abort", abortHandler);
      resolve({ stdout: "", stderr: err.message, exitCode: 1, timedOut: false });
    });
  });
}

/**
 * shell.run - Execute a shell command
 */
export const shellRun = defineAction({
  id: "shell.run",
  label: "Run Command",
  description: "Execute a shell command and wait for output",
  category: "shell",
  icon: "terminal",

  params: z.object({
    command: z.string().describe("Shell command to execute"),
    timeout: z.number().int().min(1000).max(MAX_TIMEOUT).optional().describe("Timeout in ms"),
  }),

  execute: async ({ command, timeout = DEFAULT_TIMEOUT }, context) => {
    const projectId = context.projectId;
    let processDb: ReturnType<typeof DatabaseManager.getProjectDb> | null = null;
    let processId: string | null = null;

    if (projectId) {
      try {
        processDb = DatabaseManager.getProjectDb(projectId);
        const scopeId = context.sessionId || projectId;
        const scope = context.sessionId ? "task" : "project";
        const process = ProcessService.startCommandRecord(
          processDb,
          {
            projectId,
            command,
            cwd: context.projectPath,
            scope,
            scopeId,
            createdBy: context.userId || "ui",
          },
          context.projectPath
        );
        processId = process.id;
      } catch (err) {
        console.error("[shell.run] Failed to record command process", err);
      }
    }

    const result = await executeCommand(
      command,
      context.projectPath,
      timeout,
      context.abortSignal
    );

    if (processDb && processId && projectId) {
      if (result.stdout) {
        ProcessService.appendOutput(processDb, processId, projectId, result.stdout, "stdout");
      }
      if (result.stderr) {
        ProcessService.appendOutput(processDb, processId, projectId, result.stderr, "stderr");
      }
      ProcessService.finishCommandRecord(processDb, processId, projectId, result.exitCode);
    }

    let output = "";
    if (result.timedOut) output += `Command timed out after ${timeout / 1000}s\n\n`;
    if (result.stdout) output += `stdout:\n${result.stdout}\n`;
    if (result.stderr) output += `${output ? "\n" : ""}stderr:\n${result.stderr}\n`;
    if (!result.stdout && !result.stderr) output = "(no output)";

    if (result.exitCode !== 0 || result.timedOut) {
      return error(output.trim());
    }

    return success("Command succeeded", output.trim(), {
      command,
      exitCode: result.exitCode,
    });
  },
});

/**
 * shell.spawn - Start a background service
 */
export const shellSpawn = defineAction({
  id: "shell.spawn",
  label: "Start Service",
  description: "Start a long-running background process",
  category: "shell",
  icon: "play",

  params: z.object({
    command: z.string().describe("Command to run as service"),
    label: z.string().optional().describe("Human-readable label"),
  }),

  execute: async ({ command, label }, context) => {
    // This is a simplified version - the full service management
    // requires database and process manager integration
    return success(
      label || "Service starting",
      `Starting: ${command}\n\nNote: Full service management requires ProcessService integration.`,
      { command, label }
    );
  },
});

/**
 * All shell actions
 */
export const shellActions = [
  shellRun,
  shellSpawn,
];
