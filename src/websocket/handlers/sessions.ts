/**
 * Session Request Handlers
 *
 * Handles WebSocket requests for session operations.
 * See: docs/implementation-plan/05-realtime-communication.md#request-handlers
 */

import { z } from "zod";
import {
  SessionCreatePayload,
  SessionListPayload,
  SessionGetPayload,
  SessionDeletePayload,
} from "../protocol.ts";
import { SessionService } from "@/services/sessions.ts";
import {
  MessageService,
  MessagePartService,
} from "@/services/messages.ts";
import { DatabaseManager } from "@/database/manager.ts";
import type { WSData } from "../connections.ts";

/**
 * Session handlers for WebSocket requests
 */
export const SessionHandlers = {
  /**
   * Create a new session
   */
  async create(payload: unknown, ctx: WSData) {
    const input = SessionCreatePayload.parse(payload);
    const db = DatabaseManager.getProjectDb(ctx.projectId);

    const session = SessionService.create(db, {
      ...input,
      agent: input.agent ?? "default",
    });

    return { session };
  },

  /**
   * List sessions
   */
  async list(payload: unknown, ctx: WSData) {
    const input = SessionListPayload.parse(payload ?? {});
    const db = DatabaseManager.getProjectDb(ctx.projectId);

    const sessions = SessionService.list(db, input);

    return { sessions };
  },

  /**
   * Get a session by ID
   */
  async get(payload: unknown, ctx: WSData) {
    const input = SessionGetPayload.parse(payload);
    const db = DatabaseManager.getProjectDb(ctx.projectId);

    const session = SessionService.getByIdOrThrow(db, input.sessionId);

    // Get messages for the session
    const messages = MessageService.listBySession(db, input.sessionId);

    // Get message parts for each message
    const messagesWithParts = messages.map((message) => ({
      ...message,
      parts: MessagePartService.listByMessage(db, message.id),
    }));

    return {
      session,
      messages: messagesWithParts,
    };
  },

  /**
   * Delete a session
   */
  async delete(payload: unknown, ctx: WSData) {
    const input = SessionDeletePayload.parse(payload);
    const db = DatabaseManager.getProjectDb(ctx.projectId);

    SessionService.delete(db, input.sessionId);

    return { deleted: true };
  },
};
