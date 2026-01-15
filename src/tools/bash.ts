/**
 * Bash Tool
 *
 * Executes shell commands in the project directory.
 * Requires code execution permission.
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import { z } from "zod";
import { spawn } from "child_process";
import { defineTool } from "./types.ts";

const DEFAULT_TIMEOUT = 120000; // 2 minutes
const MAX_TIMEOUT = 600000; // 10 minutes
const MAX_OUTPUT_LENGTH = 30000;

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Execute a command with timeout and output limits
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeout: number,
  abortSignal: AbortSignal
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, {
      shell: true,
      cwd,
      env: {
        ...process.env,
        // Ensure consistent output
        TERM: "dumb",
        NO_COLOR: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    // Handle abort signal
    const abortHandler = () => {
      proc.kill("SIGTERM");
    };
    abortSignal.addEventListener("abort", abortHandler);

    // Collect stdout
    proc.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length < MAX_OUTPUT_LENGTH) {
        stdout += chunk;
      }
    });

    // Collect stderr
    proc.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length < MAX_OUTPUT_LENGTH) {
        stderr += chunk;
      }
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    }, timeout);

    // Handle completion
    proc.on("close", (exitCode) => {
      clearTimeout(timeoutId);
      abortSignal.removeEventListener("abort", abortHandler);

      // Truncate output if needed
      if (stdout.length > MAX_OUTPUT_LENGTH) {
        stdout =
          stdout.slice(0, MAX_OUTPUT_LENGTH) +
          "\n\n... (output truncated)";
      }
      if (stderr.length > MAX_OUTPUT_LENGTH) {
        stderr =
          stderr.slice(0, MAX_OUTPUT_LENGTH) +
          "\n\n... (output truncated)";
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 1,
        timedOut,
      });
    });

    // Handle errors
    proc.on("error", (error) => {
      clearTimeout(timeoutId);
      abortSignal.removeEventListener("abort", abortHandler);
      resolve({
        stdout: "",
        stderr: error.message,
        exitCode: 1,
        timedOut: false,
      });
    });
  });
}

export const bashTool = defineTool("bash", {
  description: `Execute a shell command in the project directory.

Usage:
- Commands run in a bash shell with the project root as working directory
- Default timeout is 2 minutes (can be extended up to 10 minutes)
- Output is captured and truncated if too long
- Use this for git operations, build commands, tests, etc.
- Avoid interactive commands (they will hang or fail)`,

  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
    timeout: z
      .number()
      .int()
      .min(1000)
      .max(MAX_TIMEOUT)
      .optional()
      .describe(`Timeout in milliseconds (default: ${DEFAULT_TIMEOUT}, max: ${MAX_TIMEOUT})`),
    description: z
      .string()
      .optional()
      .describe("Optional description of what this command does"),
  }),

  async execute(args, context) {
    const { command, timeout = DEFAULT_TIMEOUT, description } = args;

    // Update metadata to show command is running
    context.updateMetadata({
      title: description || "Running command",
      description: command.length > 100 ? command.slice(0, 100) + "..." : command,
    });

    const result = await executeCommand(
      command,
      context.projectPath,
      timeout,
      context.abortSignal
    );

    // Build output
    let output = "";

    if (result.timedOut) {
      output += `Command timed out after ${timeout / 1000} seconds\n\n`;
    }

    if (result.stdout) {
      output += `stdout:\n${result.stdout}\n`;
    }

    if (result.stderr) {
      if (output) output += "\n";
      output += `stderr:\n${result.stderr}\n`;
    }

    if (!result.stdout && !result.stderr) {
      output = "(no output)";
    }

    // Determine title based on exit code
    let title: string;
    if (result.timedOut) {
      title = "Command timed out";
    } else if (result.exitCode === 0) {
      title = description || "Command succeeded";
    } else {
      title = `Command failed (exit code ${result.exitCode})`;
    }

    return {
      title,
      output: output.trim(),
      metadata: {
        command,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      },
      success: result.exitCode === 0 && !result.timedOut,
    };
  },
});
