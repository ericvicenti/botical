/**
 * State Synchronization
 *
 * Provides utilities for syncing client state after reconnection.
 * See: docs/implementation-plan/05-realtime-communication.md#reconnection--state-sync
 *
 * When a client reconnects, they can request state sync to catch up on
 * any events they missed while disconnected.
 */

import { DatabaseManager } from "@/database/manager.ts";
import { SessionService, type Session } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import type { Message, MessagePart } from "@/services/messages.ts";
import { ConnectionManager } from "./connections.ts";
import { createEvent } from "./protocol.ts";

/**
 * Message with its parts
 */
export interface MessageWithParts extends Message {
  parts: MessagePart[];
}

/**
 * Session state including messages
 */
export interface SessionState {
  session: Session;
  messages: MessageWithParts[];
}

/**
 * State Sync utilities
 */
export class StateSync {
  /**
   * Get full session state for reconnection/sync
   *
   * @param projectId - The project ID
   * @param sessionId - The session ID
   * @param afterMessageId - Optional: Only get messages after this ID
   */
  static getSessionState(
    projectId: string,
    sessionId: string,
    afterMessageId?: string
  ): SessionState {
    const db = DatabaseManager.getProjectDb(projectId);

    // Get session
    const session = SessionService.getByIdOrThrow(db, sessionId);

    // Get messages
    let messages = MessageService.listBySession(db, sessionId);

    // If afterMessageId is specified, filter to only newer messages
    if (afterMessageId) {
      const afterIndex = messages.findIndex((m) => m.id === afterMessageId);
      if (afterIndex !== -1) {
        messages = messages.slice(afterIndex + 1);
      }
    }

    // Get parts for each message
    const messagesWithParts: MessageWithParts[] = messages.map((message) => ({
      ...message,
      parts: MessagePartService.listByMessage(db, message.id),
    }));

    return {
      session,
      messages: messagesWithParts,
    };
  }

  /**
   * Send sync event to a specific connection
   *
   * @param connectionId - The connection ID
   * @param projectId - The project ID
   * @param sessionId - The session ID
   * @param lastKnownMessageId - Optional: The last message ID the client knows about
   */
  static syncClient(
    connectionId: string,
    projectId: string,
    sessionId: string,
    lastKnownMessageId?: string
  ): void {
    const conn = ConnectionManager.get(connectionId);
    if (!conn) return;

    try {
      const state = this.getSessionState(
        projectId,
        sessionId,
        lastKnownMessageId
      );

      ConnectionManager.send(
        connectionId,
        createEvent("session.sync", state)
      );
    } catch (error) {
      console.error("[StateSync] Failed to sync client:", error);
    }
  }

  /**
   * Get list of active sessions for a project
   */
  static getActiveSessions(projectId: string): Session[] {
    const db = DatabaseManager.getProjectDb(projectId);
    return SessionService.list(db, { status: "active" });
  }

  /**
   * Get basic session info without messages (for session list)
   */
  static getSessionsSummary(
    projectId: string,
    options: {
      status?: "active" | "archived" | "deleted";
      limit?: number;
    } = {}
  ): Session[] {
    const db = DatabaseManager.getProjectDb(projectId);
    return SessionService.list(db, options);
  }
}
