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
import { ProjectService } from "@/services/projects.ts";
import { ServiceConfigService } from "@/services/service-config.ts";

export const serviceTool = defineTool("service", {
  description: `Start a long-running service process (non-blocking).

Usage:
- Ideal for dev servers, file watchers, build processes that need to keep running
- Returns immediately with a process ID - does not wait for completion
- Output streams in real-time via WebSocket to the UI
- Use for: npm run dev, bun run --watch, pytest --watch, etc.
- The process continues running after this tool returns
- Use bash tool instead for quick commands that need output immediately
- Use saveAsService=true to save the service configuration for future use
- Use autoStart=true to automatically restart the service when Botical starts

Examples:
- Start dev server: command="npm run dev", label="Dev Server"
- Start watch mode: command="bun test --watch", label="Test Watcher"
- Start build watcher: command="vite build --watch", label="Build"
- Save as auto-start service: command="npm run dev", label="Dev Server", saveAsService=true, autoStart=true`,

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
    saveAsService: z
      .boolean()
      .optional()
      .default(true)
      .describe("Save this as a persistent service configuration that can be managed and restarted (default: true)"),
    autoStart: z
      .boolean()
      .optional()
      .describe("If saveAsService is true, automatically start this service when Botical starts"),
  }),

  async execute(args, context) {
    const { command, label, waitForReady = 0, saveAsService = true, autoStart = false } = args;

    // Update metadata to show process is starting
    context.updateMetadata({
      title: label || "Starting service",
      description: command.length > 100 ? command.slice(0, 100) + "..." : command,
    });

    const db = DatabaseManager.getProjectDb(context.projectId);

    // Get the project to find the actual workspace path
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.getByIdOrThrow(rootDb, context.projectId);
    const projectPath = project.path || Config.getProjectDir(context.projectId);

    // Save as service configuration if requested
    let serviceId: string | undefined;
    if (saveAsService) {
      const serviceName = label || `Service: ${command.slice(0, 50)}`;

      // Check if service with this name already exists
      const existingService = ServiceConfigService.getByName(db, context.projectId, serviceName);

      if (existingService) {
        // Update existing service
        ServiceConfigService.update(db, existingService.id, {
          command,
          autoStart,
        });
        serviceId = existingService.id;
      } else {
        // Create new service configuration
        const service = ServiceConfigService.create(db, {
          projectId: context.projectId,
          name: serviceName,
          command,
          cwd: projectPath,
          autoStart,
          enabled: true,
          createdBy: context.userId,
        });
        serviceId = service.id;
      }
    }

    // Spawn the process
    const process = ProcessService.spawn(db, {
      projectId: context.projectId,
      type: "service",
      command,
      cwd: projectPath,
      scope: "task",
      scopeId: context.sessionId,
      label: label || undefined,
      serviceId,
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

    if (saveAsService) {
      responseText += `\nSaved as service: ${serviceId}`;
      if (autoStart) {
        responseText += " (auto-start enabled)";
      }
    }

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
        serviceId,
        command,
        status: currentProcess?.status || process.status,
        label,
        autoStart: saveAsService ? autoStart : undefined,
      },
      success: true,
    };
  },
});
