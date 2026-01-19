/**
 * Process Service
 *
 * Manages shell commands and services with PTY support.
 * Handles process lifecycle, I/O, output storage, and cleanup.
 *
 * See: docs/implementation-plan/11-process-management.md
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";
import { ptyProcessManager } from "./pty-process-manager.ts";
import { EventBus } from "@/bus/index.ts";
import type { Database } from "bun:sqlite";

/**
 * Process type
 */
export type ProcessType = "command" | "service";

/**
 * Process status
 */
export type ProcessStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "killed";

/**
 * Process scope
 */
export type ProcessScope = "task" | "mission" | "project";

/**
 * Stream type
 */
export type StreamType = "stdout" | "stderr";

/**
 * Process entity
 */
export interface Process {
  id: string;
  projectId: string;
  type: ProcessType;
  command: string;
  cwd: string;
  env: Record<string, string> | null;
  cols: number;
  rows: number;
  scope: ProcessScope;
  scopeId: string;
  status: ProcessStatus;
  exitCode: number | null;
  label: string | null;
  serviceId: string | null;
  logPath: string | null;
  createdBy: string;
  createdAt: number;
  startedAt: number;
  endedAt: number | null;
}

/**
 * Process output chunk
 */
export interface ProcessOutput {
  id: number;
  processId: string;
  timestamp: number;
  data: string;
  stream: StreamType;
}

/**
 * Database row type
 */
interface ProcessRow {
  id: string;
  project_id: string;
  type: string;
  command: string;
  cwd: string;
  env: string | null;
  cols: number;
  rows: number;
  scope: string;
  scope_id: string;
  status: string;
  exit_code: number | null;
  label: string | null;
  service_id: string | null;
  log_path: string | null;
  created_by: string;
  created_at: number;
  started_at: number;
  ended_at: number | null;
}

/**
 * Process output row type
 */
interface ProcessOutputRow {
  id: number;
  process_id: string;
  timestamp: number;
  data: string;
  stream: string;
}

/**
 * Process spawn input schema
 */
export const SpawnProcessSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["command", "service"]),
  command: z.string().min(1).max(10000),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  cols: z.number().int().min(1).max(1000).optional().default(80),
  rows: z.number().int().min(1).max(1000).optional().default(24),
  scope: z.enum(["task", "mission", "project"]),
  scopeId: z.string().min(1),
  label: z.string().max(200).optional(),
  serviceId: z.string().optional(),
  logPath: z.string().optional(),
  createdBy: z.string().min(1),
});

export type SpawnProcessInput = z.infer<typeof SpawnProcessSchema>;

/**
 * Process filter options
 */
export interface ProcessFilters {
  type?: ProcessType;
  status?: ProcessStatus;
  scope?: ProcessScope;
  scopeId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Output retrieval options
 */
export interface OutputOptions {
  limit?: number;
  offset?: number;
  since?: number; // Timestamp
}

/**
 * Convert database row to process entity
 */
function rowToProcess(row: ProcessRow): Process {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as ProcessType,
    command: row.command,
    cwd: row.cwd,
    env: row.env ? JSON.parse(row.env) : null,
    cols: row.cols,
    rows: row.rows,
    scope: row.scope as ProcessScope,
    scopeId: row.scope_id,
    status: row.status as ProcessStatus,
    exitCode: row.exit_code,
    label: row.label,
    serviceId: row.service_id,
    logPath: row.log_path,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

/**
 * Convert database row to output entity
 */
function rowToOutput(row: ProcessOutputRow): ProcessOutput {
  return {
    id: row.id,
    processId: row.process_id,
    timestamp: row.timestamp,
    data: row.data,
    stream: row.stream as StreamType,
  };
}

/**
 * Process Service
 */
export class ProcessService {
  /**
   * Spawn a new process
   */
  static spawn(
    db: Database,
    input: SpawnProcessInput,
    projectPath: string
  ): Process {
    const data = SpawnProcessSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.process);
    const cwd = data.cwd || projectPath;

    // Calculate log path if not provided (for services)
    let logPath = data.logPath;
    if (!logPath && data.type === "service") {
      logPath = this.getLogPath(projectPath, id);
    }

    // Create process record
    db.prepare(
      `INSERT INTO processes (
        id, project_id, type, command, cwd, env, cols, rows,
        scope, scope_id, status, label, service_id, log_path, created_by, created_at, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'starting', ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.projectId,
      data.type,
      data.command,
      cwd,
      data.env ? JSON.stringify(data.env) : null,
      data.cols,
      data.rows,
      data.scope,
      data.scopeId,
      data.label || null,
      data.serviceId || null,
      logPath || null,
      data.createdBy,
      now,
      now
    );

    const process = this.getByIdOrThrow(db, id);

    const projectId = data.projectId;

    // Start process
    ptyProcessManager.create(id, data.command, {
      cwd,
      env: data.env,
      cols: data.cols,
      rows: data.rows,
      logPath,
      onData: (output) => {
        // Store output
        db.prepare(
          `INSERT INTO process_output (process_id, timestamp, data, stream)
           VALUES (?, ?, ?, 'stdout')`
        ).run(id, Date.now(), output);

        // Broadcast to WebSocket
        EventBus.publish(projectId, {
          type: "process.output",
          payload: {
            id,
            data: output,
            stream: "stdout",
          },
        });
      },
      onExit: (exitCode) => {
        this.markExited(db, id, projectId, exitCode);
        ptyProcessManager.cleanup(id);
      },
    });

    // Update status to running
    db.prepare(`UPDATE processes SET status = 'running' WHERE id = ?`).run(id);

    const spawnedProcess = this.getByIdOrThrow(db, id);
    EventBus.publish(projectId, {
      type: "process.spawned",
      payload: spawnedProcess,
    });

    return this.getByIdOrThrow(db, id);
  }

  /**
   * Get log path for a process
   */
  static getLogPath(projectPath: string, processId: string): string {
    return `${projectPath}/.iris/logs/${processId}.log`;
  }

  /**
   * Kill a process
   */
  static kill(db: Database, processId: string): void {
    const process = this.getByIdOrThrow(db, processId);

    if (process.status !== "running" && process.status !== "starting") {
      throw new ValidationError("Can only kill running or starting processes");
    }

    ptyProcessManager.kill(processId);

    const now = Date.now();
    db.prepare(
      `UPDATE processes SET status = 'killed', ended_at = ? WHERE id = ?`
    ).run(now, processId);

    EventBus.publish(process.projectId, {
      type: "process.killed",
      payload: { id: processId, projectId: process.projectId },
    });
  }

  /**
   * Write to process stdin
   */
  static write(db: Database, processId: string, data: string): void {
    const process = this.getByIdOrThrow(db, processId);

    if (process.status !== "running") {
      throw new ValidationError("Can only write to running processes");
    }

    if (!ptyProcessManager.write(processId, data)) {
      throw new ValidationError("Process not found");
    }
  }

  /**
   * Resize process terminal
   */
  static resize(
    db: Database,
    processId: string,
    cols: number,
    rows: number
  ): void {
    const process = this.getByIdOrThrow(db, processId);

    if (process.status !== "running") {
      throw new ValidationError("Can only resize running processes");
    }

    if (!ptyProcessManager.resize(processId, cols, rows)) {
      throw new ValidationError("Process not found");
    }

    // Update stored dimensions
    db.prepare(`UPDATE processes SET cols = ?, rows = ? WHERE id = ?`).run(
      cols,
      rows,
      processId
    );
  }

  /**
   * Get process by ID
   */
  static getById(db: Database, processId: string): Process | null {
    const row = db
      .prepare("SELECT * FROM processes WHERE id = ?")
      .get(processId) as ProcessRow | undefined;

    return row ? rowToProcess(row) : null;
  }

  /**
   * Get process by ID or throw
   */
  static getByIdOrThrow(db: Database, processId: string): Process {
    const process = this.getById(db, processId);
    if (!process) {
      throw new NotFoundError("Process", processId);
    }
    return process;
  }

  /**
   * List processes for a project
   */
  static listByProject(
    db: Database,
    projectId: string,
    filters: ProcessFilters = {}
  ): Process[] {
    let query = "SELECT * FROM processes WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (filters.type) {
      query += " AND type = ?";
      params.push(filters.type);
    }

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }

    if (filters.scope) {
      query += " AND scope = ?";
      params.push(filters.scope);
    }

    if (filters.scopeId) {
      query += " AND scope_id = ?";
      params.push(filters.scopeId);
    }

    query += " ORDER BY created_at DESC";

    if (filters.limit) {
      query += " LIMIT ?";
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += " OFFSET ?";
      params.push(filters.offset);
    }

    const rows = db.prepare(query).all(...params) as ProcessRow[];
    return rows.map(rowToProcess);
  }

  /**
   * List running processes
   */
  static listRunning(db: Database): Process[] {
    const rows = db
      .prepare(
        "SELECT * FROM processes WHERE status IN ('starting', 'running') ORDER BY created_at DESC"
      )
      .all() as ProcessRow[];

    return rows.map(rowToProcess);
  }

  /**
   * Get process output
   */
  static getOutput(
    db: Database,
    processId: string,
    options: OutputOptions = {}
  ): ProcessOutput[] {
    // Verify process exists
    this.getByIdOrThrow(db, processId);

    let query = "SELECT * FROM process_output WHERE process_id = ?";
    const params: (string | number)[] = [processId];

    if (options.since) {
      query += " AND timestamp > ?";
      params.push(options.since);
    }

    query += " ORDER BY timestamp ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as ProcessOutputRow[];
    return rows.map(rowToOutput);
  }

  /**
   * Get combined output as string
   */
  static getOutputText(
    db: Database,
    processId: string,
    options: OutputOptions = {}
  ): string {
    const outputs = this.getOutput(db, processId, options);
    return outputs.map((o) => o.data).join("");
  }

  /**
   * Kill all processes for a scope
   */
  static killByScope(
    db: Database,
    scope: ProcessScope,
    scopeId: string
  ): number {
    const processes = db
      .prepare(
        "SELECT * FROM processes WHERE scope = ? AND scope_id = ? AND status IN ('starting', 'running')"
      )
      .all(scope, scopeId) as ProcessRow[];

    for (const row of processes) {
      ptyProcessManager.kill(row.id);
    }

    const now = Date.now();
    const result = db
      .prepare(
        `UPDATE processes SET status = 'killed', ended_at = ?
         WHERE scope = ? AND scope_id = ? AND status IN ('starting', 'running')`
      )
      .run(now, scope, scopeId);

    return result.changes;
  }

  /**
   * Count processes
   */
  static count(
    db: Database,
    projectId: string,
    filters: Pick<ProcessFilters, "type" | "status"> = {}
  ): number {
    let query = "SELECT COUNT(*) as count FROM processes WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (filters.type) {
      query += " AND type = ?";
      params.push(filters.type);
    }

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }

    const row = db.prepare(query).get(...params) as { count: number };
    return row.count;
  }

  /**
   * Mark process as exited
   */
  private static markExited(
    db: Database,
    processId: string,
    projectId: string,
    exitCode: number
  ): void {
    const now = Date.now();
    const status: ProcessStatus = exitCode === 0 ? "completed" : "failed";

    db.prepare(
      `UPDATE processes SET status = ?, exit_code = ?, ended_at = ? WHERE id = ?`
    ).run(status, exitCode, now, processId);

    EventBus.publish(projectId, {
      type: "process.exited",
      payload: {
        id: processId,
        projectId,
        exitCode,
        status,
      },
    });
  }

  /**
   * Delete a process and its output
   */
  static delete(db: Database, processId: string): void {
    const process = this.getByIdOrThrow(db, processId);

    if (process.status === "running" || process.status === "starting") {
      throw new ValidationError("Cannot delete running process");
    }

    // Delete output first (foreign key)
    db.prepare("DELETE FROM process_output WHERE process_id = ?").run(
      processId
    );

    // Delete process
    db.prepare("DELETE FROM processes WHERE id = ?").run(processId);
  }

  /**
   * Clear old output for a process (keep last N chunks)
   */
  static trimOutput(db: Database, processId: string, keepCount: number): number {
    this.getByIdOrThrow(db, processId);

    const result = db
      .prepare(
        `DELETE FROM process_output
         WHERE process_id = ?
         AND id NOT IN (
           SELECT id FROM process_output
           WHERE process_id = ?
           ORDER BY timestamp DESC
           LIMIT ?
         )`
      )
      .run(processId, processId, keepCount);

    return result.changes;
  }
}
