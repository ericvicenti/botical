/**
 * WebSocket Handler
 *
 * Main WebSocket connection handler for Botical.
 * See: docs/implementation-plan/05-realtime-communication.md#websocket-handler
 *
 * Authentication flow:
 * 1. Client connects with ?token=xxx&projectId=yyy
 * 2. Token is validated before upgrade
 * 3. Connection is registered with ConnectionManager
 * 4. Client is joined to project room
 */

import type { Context } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { generateId } from "@/utils/id.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { SessionService as AuthSessionService } from "@/auth/session.ts";
import { LocalUserService, LOCAL_USER_ID } from "@/auth/local-user.ts";
import { hashSha256 } from "@/services/crypto.ts";
import {
  ConnectionManager,
  type WebSocketConnection,
  type WSData,
} from "./connections.ts";
import { RoomManager, getProjectRoom } from "./rooms.ts";
import { handleRequest } from "./handlers/index.ts";
import {
  WSRequest,
  createResponse,
  createErrorResponse,
  createEvent,
} from "./protocol.ts";

/**
 * User info returned from token validation
 */
interface UserInfo {
  userId: string;
  email: string;
  isAdmin: boolean;
  canExecuteCode: boolean;
}

/**
 * Validate authentication token
 */
function validateToken(token: string): UserInfo | null {
  // Check if it's an API key
  if (token.startsWith("botical_")) {
    const db = DatabaseManager.getRootDb();
    const keyHash = hashSha256(token);

    const row = db
      .prepare(
        `
      SELECT ak.user_id, u.email, u.is_admin, u.can_execute_code
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = ? AND ak.revoked_at IS NULL
      AND (ak.expires_at IS NULL OR ak.expires_at > ?)
    `
      )
      .get(keyHash, Date.now()) as
      | {
          user_id: string;
          email: string | null;
          is_admin: number;
          can_execute_code: number;
        }
      | undefined;

    if (!row) return null;

    return {
      userId: row.user_id,
      email: row.email ?? "",
      isAdmin: Boolean(row.is_admin),
      canExecuteCode: Boolean(row.can_execute_code),
    };
  }

  // Session token
  const session = AuthSessionService.validate(token);
  if (!session) return null;

  const db = DatabaseManager.getRootDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.userId) as
    | {
        id: string;
        email: string | null;
        is_admin: number;
        can_execute_code: number;
      }
    | undefined;

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    isAdmin: Boolean(user.is_admin),
    canExecuteCode: Boolean(user.can_execute_code),
  };
}

/**
 * Check if user has access to project
 */
function hasProjectAccess(userId: string, projectId: string): boolean {
  const db = DatabaseManager.getRootDb();

  // Check if user is owner
  const project = db
    .prepare("SELECT owner_id FROM projects WHERE id = ?")
    .get(projectId) as { owner_id: string } | undefined;

  if (project?.owner_id === userId) {
    return true;
  }

  // Check if user is a member
  const member = db
    .prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?")
    .get(projectId, userId);

  return Boolean(member);
}

/**
 * Create the WebSocket upgrade handler
 */
export function createWebSocketHandler() {
  return upgradeWebSocket((c: Context) => {
    // Extract and validate auth before upgrade
    const token = c.req.query("token");
    const projectId = c.req.query("projectId");

    // These will be set after validation in onOpen
    let userData: WSData | null = null;

    return {
      onOpen(event, ws) {
        const rawWs = ws as unknown as WebSocketConnection;

        // Generate connection ID
        const connectionId = generateId("conn");

        // Single-user mode: auto-authenticate as local user
        if (Config.isSingleUserMode()) {
          const localAuth = LocalUserService.ensureLocalUser();

          // In single-user mode, projectId is optional for global connections
          const targetProjectId = projectId || "global";

          userData = {
            userId: localAuth.userId,
            projectId: targetProjectId,
            connectionId,
          };

          // Register connection
          ConnectionManager.add(connectionId, {
            ws: rawWs,
            userId: localAuth.userId,
            projectId: targetProjectId,
            connectedAt: Date.now(),
            lastActivity: Date.now(),
          });

          // Join project room if specific project
          if (projectId) {
            RoomManager.join(getProjectRoom(projectId), connectionId);
          }

          // Send welcome message
          rawWs.send(
            JSON.stringify(
              createEvent("connected", {
                connectionId,
                projectId: targetProjectId,
                userId: localAuth.userId,
                singleUserMode: true,
              })
            )
          );

          console.log(
            `[WebSocket] Single-user connection ${connectionId} opened`
          );
          return;
        }

        // Development mode: allow anonymous connections
        const isDev = process.env.NODE_ENV !== "production";

        if (!token && !projectId && isDev) {
          // Anonymous dev connection - limited functionality
          userData = {
            userId: "anonymous",
            projectId: "global",
            connectionId,
          };

          // Register connection
          ConnectionManager.add(connectionId, {
            ws: rawWs,
            userId: "anonymous",
            projectId: "global",
            connectedAt: Date.now(),
            lastActivity: Date.now(),
          });

          // Send welcome message
          rawWs.send(
            JSON.stringify(
              createEvent("connected", {
                connectionId,
                projectId: "global",
                userId: "anonymous",
                anonymous: true,
              })
            )
          );

          console.log(
            `[WebSocket] Anonymous dev connection ${connectionId} opened`
          );
          return;
        }

        // Multi-user mode: validate token
        if (!token || !projectId) {
          rawWs.close(4001, "Missing token or projectId");
          return;
        }

        const userInfo = validateToken(token);
        if (!userInfo) {
          rawWs.close(4001, "Invalid token");
          return;
        }

        // Check project access
        if (!hasProjectAccess(userInfo.userId, projectId)) {
          rawWs.close(4003, "Access denied to project");
          return;
        }

        // Store connection data
        userData = {
          userId: userInfo.userId,
          projectId,
          connectionId,
        };

        // Register connection
        ConnectionManager.add(connectionId, {
          ws: rawWs,
          userId: userInfo.userId,
          projectId,
          connectedAt: Date.now(),
          lastActivity: Date.now(),
        });

        // Join project room
        RoomManager.join(getProjectRoom(projectId), connectionId);

        // Send welcome message
        rawWs.send(
          JSON.stringify(
            createEvent("connected", {
              connectionId,
              projectId,
              userId: userInfo.userId,
            })
          )
        );

        console.log(
          `[WebSocket] Connection ${connectionId} opened for user ${userInfo.userId}`
        );
      },

      async onMessage(event, ws) {
        if (!userData) {
          return;
        }

        const rawWs = ws as unknown as WebSocketConnection;

        // Update activity
        ConnectionManager.updateActivity(userData.connectionId);

        try {
          // Parse message
          const data = JSON.parse(event.data.toString());
          const request = WSRequest.parse(data);

          // Handle request
          const result = await handleRequest(request, userData);

          // Send response
          rawWs.send(JSON.stringify(createResponse(request.id, result)));
        } catch (error) {
          // Parse error - try to extract ID from raw message
          let requestId = "unknown";
          try {
            const data = JSON.parse(event.data.toString());
            requestId = data.id ?? "unknown";
          } catch {
            // Ignore parse errors
          }

          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          const errorCode =
            error instanceof Error && "code" in error
              ? (error as Error & { code: string }).code
              : "INTERNAL_ERROR";

          rawWs.send(
            JSON.stringify(
              createErrorResponse(requestId, errorCode, errorMessage)
            )
          );

          console.error("[WebSocket] Request error:", error);
        }
      },

      onClose(event, ws) {
        if (!userData) {
          return;
        }

        // Leave all rooms
        RoomManager.leaveAll(userData.connectionId);

        // Remove connection
        ConnectionManager.remove(userData.connectionId);

        console.log(
          `[WebSocket] Connection ${userData.connectionId} closed (${event.code}: ${event.reason})`
        );
      },

      onError(event, ws) {
        console.error("[WebSocket] Error:", event);
      },
    };
  });
}
