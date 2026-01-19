/**
 * Service Runner
 *
 * Manages automatic starting of services when Iris starts.
 * Handles spawning auto-start services and graceful shutdown.
 *
 * See: docs/implementation-plan/18-enhanced-service-management.md
 */

import { DatabaseManager } from "@/database/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { ServiceConfigService } from "@/services/service-config.ts";
import { ProcessService } from "@/services/processes.ts";
import { Config } from "@/config/index.ts";
import { bunProcessManager } from "@/services/bun-process-manager.ts";

/**
 * Service Runner - manages auto-start services
 */
export class ServiceRunner {
  private static isRunning = false;

  /**
   * Start all auto-start services across all projects
   */
  static async startAutoServices(): Promise<void> {
    if (this.isRunning) {
      console.log("ServiceRunner is already running");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Starting auto-start services...");

    try {
      const rootDb = DatabaseManager.getRootDb();
      const projects = ProjectService.list(rootDb);

      let totalStarted = 0;

      for (const project of projects) {
        try {
          const db = DatabaseManager.getProjectDb(project.id);
          const services = ServiceConfigService.getAutoStart(db, project.id);

          if (services.length === 0) {
            continue;
          }

          console.log(
            `  📦 Project "${project.name}": ${services.length} auto-start service(s)`
          );

          for (const service of services) {
            try {
              const projectPath =
                project.path || Config.getProjectDir(project.id);

              // Spawn the process for this service
              const process = ProcessService.spawn(
                db,
                {
                  projectId: project.id,
                  type: "service",
                  command: service.command,
                  cwd: service.cwd || projectPath,
                  env: service.env || undefined,
                  cols: 120,
                  rows: 30,
                  scope: "project",
                  scopeId: project.id,
                  label: service.name,
                  serviceId: service.id,
                  createdBy: "system",
                },
                projectPath
              );

              console.log(
                `    ✅ Started "${service.name}" (${process.id})`
              );
              totalStarted++;
            } catch (error) {
              console.error(
                `    ❌ Failed to start "${service.name}":`,
                error instanceof Error ? error.message : error
              );
            }
          }
        } catch (error) {
          console.error(
            `  ❌ Failed to process project "${project.name}":`,
            error instanceof Error ? error.message : error
          );
        }
      }

      if (totalStarted > 0) {
        console.log(`✅ Started ${totalStarted} auto-start service(s)`);
      } else {
        console.log("ℹ️  No auto-start services configured");
      }
    } catch (error) {
      console.error(
        "❌ Failed to start auto-start services:",
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Start a specific service by ID
   */
  static async startService(
    projectId: string,
    serviceId: string
  ): Promise<string> {
    const db = DatabaseManager.getProjectDb(projectId);
    const service = ServiceConfigService.getByIdOrThrow(db, serviceId);

    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.getByIdOrThrow(rootDb, projectId);
    const projectPath = project.path || Config.getProjectDir(projectId);

    // Check if service is already running
    const runningProcesses = ProcessService.listByProject(db, projectId, {
      status: "running",
    });

    const existingProcess = runningProcesses.find(
      (p) => p.serviceId === serviceId
    );
    if (existingProcess) {
      throw new Error(
        `Service "${service.name}" is already running (process: ${existingProcess.id})`
      );
    }

    // Spawn the process
    const process = ProcessService.spawn(
      db,
      {
        projectId,
        type: "service",
        command: service.command,
        cwd: service.cwd || projectPath,
        env: service.env || undefined,
        cols: 120,
        rows: 30,
        scope: "project",
        scopeId: projectId,
        label: service.name,
        serviceId: service.id,
        createdBy: "system",
      },
      projectPath
    );

    return process.id;
  }

  /**
   * Stop a specific service by ID (kills the running process)
   */
  static async stopService(projectId: string, serviceId: string): Promise<void> {
    const db = DatabaseManager.getProjectDb(projectId);
    const service = ServiceConfigService.getByIdOrThrow(db, serviceId);

    // Find running process for this service
    const runningProcesses = ProcessService.listByProject(db, projectId, {
      status: "running",
    });

    const process = runningProcesses.find((p) => p.serviceId === serviceId);
    if (!process) {
      throw new Error(`Service "${service.name}" is not running`);
    }

    ProcessService.kill(db, process.id);
  }

  /**
   * Restart a specific service by ID
   */
  static async restartService(
    projectId: string,
    serviceId: string
  ): Promise<string> {
    const db = DatabaseManager.getProjectDb(projectId);

    // Try to stop the service if running
    try {
      await this.stopService(projectId, serviceId);
      // Give it a moment to clean up
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      // Service might not be running, which is fine
    }

    // Start the service
    return this.startService(projectId, serviceId);
  }

  /**
   * Get the running process for a service, if any
   */
  static getRunningProcess(
    projectId: string,
    serviceId: string
  ): ReturnType<typeof ProcessService.getById> {
    const db = DatabaseManager.getProjectDb(projectId);

    const runningProcesses = ProcessService.listByProject(db, projectId, {
      status: "running",
    });

    return runningProcesses.find((p) => p.serviceId === serviceId) || null;
  }

  /**
   * Stop all running services gracefully
   */
  static async stopAllServices(): Promise<void> {
    console.log("🛑 Stopping all services...");

    try {
      // Kill all processes managed by the process manager
      const activeCount = bunProcessManager.getActiveCount();
      if (activeCount > 0) {
        console.log(`  Killing ${activeCount} active process(es)...`);
        bunProcessManager.killAll();
      }

      console.log("✅ All services stopped");
    } catch (error) {
      console.error(
        "❌ Error stopping services:",
        error instanceof Error ? error.message : error
      );
    }
  }
}
