/**
 * Process WebSocket Handlers
 *
 * Handles WebSocket requests for process I/O operations.
 * See: docs/implementation-plan/11-process-management.md#websocket-support
 */

import { DatabaseManager } from "@/database/index.ts";
import { ProcessService } from "@/services/processes.ts";
import {
  ProcessWritePayload,
  ProcessResizePayload,
  ProcessKillPayload,
} from "../protocol.ts";
import type { WSData } from "../connections.ts";

/**
 * Helper to get project DB from process
 */
function getDbForProcess(
  processId: string
): ReturnType<typeof DatabaseManager.getProjectDb> {
  const projectDbs = DatabaseManager.getOpenProjectIds();
  for (const projectId of projectDbs) {
    const db = DatabaseManager.getProjectDb(projectId);
    const process = ProcessService.getById(db, processId);
    if (process) {
      return db;
    }
  }
  throw new Error("Process not found in any project");
}

/**
 * Process handlers for WebSocket requests
 */
export const ProcessHandlers = {
  /**
   * Write data to process stdin
   */
  async write(payload: unknown, _ctx: WSData): Promise<{ success: boolean }> {
    const data = ProcessWritePayload.parse(payload);
    const db = getDbForProcess(data.id);
    ProcessService.write(db, data.id, data.data);
    return { success: true };
  },

  /**
   * Resize process terminal
   */
  async resize(payload: unknown, _ctx: WSData): Promise<{ success: boolean }> {
    const data = ProcessResizePayload.parse(payload);
    const db = getDbForProcess(data.id);
    ProcessService.resize(db, data.id, data.cols, data.rows);
    return { success: true };
  },

  /**
   * Kill a running process
   */
  async kill(payload: unknown, _ctx: WSData): Promise<{ success: boolean }> {
    const data = ProcessKillPayload.parse(payload);
    const db = getDbForProcess(data.id);
    ProcessService.kill(db, data.id);
    return { success: true };
  },
};
