/**
 * App WebSocket Handlers
 *
 * Handles WebSocket messages for Iris Apps.
 * Supports real-time UI synchronization and action execution.
 *
 * Request types:
 * - app.subscribe: Subscribe to app UI updates
 * - app.unsubscribe: Unsubscribe from app updates
 * - app.action: Execute an action on an app
 * - app.activate: Activate an app
 * - app.deactivate: Deactivate an app
 */

import type { WSData } from "../connections.ts";
import { RoomManager } from "../rooms.ts";
import { createEvent } from "../protocol.ts";
import { ConnectionManager } from "../connections.ts";
import { getAppManager } from "@/apps/index.ts";
import { DatabaseManager } from "@/database/index.ts";

/**
 * Get the room name for an app
 */
export function getAppRoom(projectId: string, appId: string): string {
  return `app:${projectId}:${appId}`;
}

/**
 * Get project path from database
 */
function getProjectPath(projectId: string): string | null {
  try {
    const db = DatabaseManager.getRootDb();
    const project = db
      .prepare("SELECT path FROM projects WHERE id = ?")
      .get(projectId) as { path: string } | undefined;
    return project?.path ?? null;
  } catch {
    return null;
  }
}

/**
 * App WebSocket handlers
 */
export const AppHandlers = {
  /**
   * Subscribe to app UI updates
   */
  async subscribe(
    payload: { appId: string },
    userData: WSData
  ): Promise<{ subscribed: boolean; ui?: unknown }> {
    const { appId } = payload;
    const { projectId, connectionId } = userData;

    const projectPath = getProjectPath(projectId);
    if (!projectPath) {
      throw new Error("Project not found");
    }

    const manager = getAppManager(projectId, projectPath);
    const app = manager.get(appId);

    if (!app) {
      throw new Error("App not found");
    }

    // Join the app room
    const room = getAppRoom(projectId, appId);
    RoomManager.join(room, connectionId);

    // Get current UI if app is active
    const runtime = manager.getRuntime(appId);
    let ui = null;

    if (runtime) {
      ui = runtime.generateUI();

      // Subscribe to runtime updates
      runtime.subscribe((message) => {
        // Broadcast to all subscribers in the room
        broadcastToRoom(room, message.type, message.payload);
      });
    }

    return {
      subscribed: true,
      ui,
    };
  },

  /**
   * Unsubscribe from app UI updates
   */
  async unsubscribe(
    payload: { appId: string },
    userData: WSData
  ): Promise<{ unsubscribed: boolean }> {
    const { appId } = payload;
    const { projectId, connectionId } = userData;

    const room = getAppRoom(projectId, appId);
    RoomManager.leave(room, connectionId);

    return { unsubscribed: true };
  },

  /**
   * Execute an action on an app
   */
  async action(
    payload: { appId: string; action: string; args?: unknown },
    userData: WSData
  ): Promise<unknown> {
    const { appId, action, args } = payload;
    const { projectId } = userData;

    const projectPath = getProjectPath(projectId);
    if (!projectPath) {
      throw new Error("Project not found");
    }

    const manager = getAppManager(projectId, projectPath);
    const runtime = manager.getRuntime(appId);

    if (!runtime) {
      throw new Error("App not active");
    }

    // Execute the action
    const result = await runtime.executeAction(action, args);

    return result;
  },

  /**
   * Activate an app
   */
  async activate(
    payload: { appId: string },
    userData: WSData
  ): Promise<{ status: string }> {
    const { appId } = payload;
    const { projectId, connectionId } = userData;

    const projectPath = getProjectPath(projectId);
    if (!projectPath) {
      throw new Error("Project not found");
    }

    const manager = getAppManager(projectId, projectPath);
    const app = manager.get(appId);

    if (!app) {
      throw new Error("App not found");
    }

    await manager.activate(appId);

    // Auto-subscribe the activating connection
    const room = getAppRoom(projectId, appId);
    RoomManager.join(room, connectionId);

    // Set up broadcast for this app
    const runtime = manager.getRuntime(appId);
    if (runtime) {
      runtime.subscribe((message) => {
        broadcastToRoom(room, message.type, message.payload);
      });
    }

    return { status: "active" };
  },

  /**
   * Deactivate an app
   */
  async deactivate(
    payload: { appId: string },
    userData: WSData
  ): Promise<{ status: string }> {
    const { appId } = payload;
    const { projectId } = userData;

    const projectPath = getProjectPath(projectId);
    if (!projectPath) {
      throw new Error("Project not found");
    }

    const manager = getAppManager(projectId, projectPath);
    await manager.deactivate(appId);

    // Notify all subscribers
    const room = getAppRoom(projectId, appId);
    broadcastToRoom(room, "app.deactivated", { appId });

    return { status: "deactivated" };
  },

  /**
   * Request hot reload
   */
  async reload(
    payload: { appId: string },
    userData: WSData
  ): Promise<{ status: string }> {
    const { appId } = payload;
    const { projectId } = userData;

    const projectPath = getProjectPath(projectId);
    if (!projectPath) {
      throw new Error("Project not found");
    }

    const manager = getAppManager(projectId, projectPath);
    await manager.hotReload(appId);

    return { status: "reloaded" };
  },
};

/**
 * Broadcast a message to all connections in a room
 */
function broadcastToRoom(room: string, type: string, payload: unknown): void {
  const connectionIds = RoomManager.getMembers(room);

  for (const connectionId of connectionIds) {
    const info = ConnectionManager.get(connectionId);
    if (info?.ws) {
      try {
        info.ws.send(
          JSON.stringify({
            type: `app.${type}`,
            payload,
          })
        );
      } catch (error) {
        console.error(`[Apps] Failed to send to ${connectionId}:`, error);
      }
    }
  }
}
