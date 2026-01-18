/**
 * Service Tool
 *
 * Spawns long-running service processes with PTY support.
 * Non-blocking: returns processId immediately.
 * Ideal for dev servers, watchers, and other persistent processes.
 * See: docs/implementation-plan/11-process-management.md
 */

import { z } from "zod";
import { defineTool } from "./types.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { ProcessService } from "@/services/processes.ts";

export const serviceTool = defineTool("service", {
  description: `Start a long-running service process (non-blocking).

Usage:
- Ideal for dev servers, file watchers, build processes that need to keep running
- Returns immediately with a process ID - does not wait for completion
- Output streams in real-time via WebSocket to the UI
- Use for: npm run dev, bun run --watch, pytest --watch, etc.
- The process continues running after this tool returns
- Use bash tool instead for quick commands that need output immediately

Examples:
- Start dev server: command="npm run dev", label="Dev Server"
- Start watch mode: command="bun test --watch", label="Test Watcher"
- Start build watcher: command="vite build --watch", label="Build"`,

  parameters: z.object({
    command: z.string().describe("The shell command to execute as a service"),
    label: z
      .string()
      .optional()
      .describe("Human-readable label for the process (shown in UI)"),
    waitForReady: z
      .number()
      .int()
      .min(0)
      .max(30000)
      .optional()
      .describe("Optional milliseconds to wait for initial output before returning"),
  }),

  async execute(args, context) {
    const { command, label, waitForReady = 0 } = args;

    // Update metadata to show process is starting
    context.updateMetadata({
      title: label || "Starting service",
      description: command.length > 100 ? command.slice(0, 100) + "..." : command,
    });

    const db = DatabaseManager.getProjectDb(context.projectId);
    const projectPath = Config.getProjectDir(context.projectId);

    // Spawn the process
    const process = ProcessService.spawn(db, {
      projectId: context.projectId,
      type: "service",
      command,
      cwd: projectPath,
      scope: "task",
      scopeId: context.sessionId,
      label: label || undefined,
      createdBy: context.userId,
      cols: 120,
      rows: 30,
    }, projectPath);

    // Optionally wait for some initial output
    if (waitForReady > 0) {
      const startTime = Date.now();
      while (Date.now() - startTime < waitForReady) {
        const output = ProcessService.getOutput(db, process.id, { limit: 1 });
        if (output.length > 0) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if process has already exited
        const currentProcess = ProcessService.getById(db, process.id);
        if (currentProcess && currentProcess.status !== "running" && currentProcess.status !== "starting") {
          break;
        }
      }
    }

    // Get current process state for the response
    const currentProcess = ProcessService.getById(db, process.id);
    const output = ProcessService.getOutputText(db, process.id, { limit: 50 });

    // Build response
    let responseText = `Service started: ${process.id}
Command: ${command}
Status: ${currentProcess?.status || process.status}
Label: ${label || "(none)"}`;

    if (output) {
      responseText += `\n\nInitial output:\n${output.slice(0, 2000)}`;
      if (output.length > 2000) {
        responseText += "\n... (output truncated, check UI for full output)";
      }
    }

    if (currentProcess?.status === "failed" || currentProcess?.status === "completed") {
      responseText += `\n\nNote: Process has already exited with code ${currentProcess.exitCode}`;
    }

    return {
      title: label || `Service: ${command.slice(0, 30)}`,
      output: responseText,
      metadata: {
        processId: process.id,
        command,
        status: currentProcess?.status || process.status,
        label,
      },
      success: true,
    };
  },
});
