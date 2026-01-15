/**
 * Tool Request Handlers
 *
 * Handles WebSocket requests for tool approval/rejection.
 * See: docs/implementation-plan/05-realtime-communication.md#request-handlers
 */

import { ToolApprovePayload, ToolRejectPayload } from "../protocol.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { MessagePartService } from "@/services/messages.ts";
import { EventBus } from "@/bus/index.ts";
import type { WSData } from "../connections.ts";

// Map of pending tool approvals and their resolve functions
interface PendingApproval {
  resolve: (approved: boolean, reason?: string) => void;
  toolCallId: string;
  sessionId: string;
}

const pendingApprovals = new Map<string, PendingApproval>();

/**
 * Register a pending tool approval
 */
export function registerPendingApproval(
  toolCallId: string,
  sessionId: string,
  resolve: (approved: boolean, reason?: string) => void
): void {
  pendingApprovals.set(toolCallId, { resolve, toolCallId, sessionId });
}

/**
 * Remove a pending tool approval
 */
export function removePendingApproval(toolCallId: string): void {
  pendingApprovals.delete(toolCallId);
}

/**
 * Tool handlers for WebSocket requests
 */
export const ToolHandlers = {
  /**
   * Approve a tool execution
   */
  async approve(payload: unknown, ctx: WSData) {
    const input = ToolApprovePayload.parse(payload);
    const db = DatabaseManager.getProjectDb(ctx.projectId);

    // Find the pending approval
    const pending = pendingApprovals.get(input.toolCallId);
    if (!pending) {
      throw new Error("No pending approval found for this tool call");
    }

    // Update tool status in database
    const part = MessagePartService.getByToolCallId(
      db,
      input.sessionId,
      input.toolCallId
    );
    if (part) {
      MessagePartService.updateToolStatus(db, part.id, "running");
    }

    // Resolve the approval
    pending.resolve(true);
    pendingApprovals.delete(input.toolCallId);

    // Publish event
    EventBus.publish(ctx.projectId, {
      type: "message.tool.result",
      payload: {
        sessionId: input.sessionId,
        messageId: part?.messageId ?? "",
        partId: part?.id ?? "",
        toolCallId: input.toolCallId,
        result: "approved",
      },
    });

    return { approved: true };
  },

  /**
   * Reject a tool execution
   */
  async reject(payload: unknown, ctx: WSData) {
    const input = ToolRejectPayload.parse(payload);
    const db = DatabaseManager.getProjectDb(ctx.projectId);

    // Find the pending approval
    const pending = pendingApprovals.get(input.toolCallId);
    if (!pending) {
      throw new Error("No pending approval found for this tool call");
    }

    // Update tool status in database
    const part = MessagePartService.getByToolCallId(
      db,
      input.sessionId,
      input.toolCallId
    );
    if (part) {
      MessagePartService.updateToolStatus(db, part.id, "error");
    }

    // Resolve the approval (with rejection)
    pending.resolve(false, input.reason);
    pendingApprovals.delete(input.toolCallId);

    // Publish event
    EventBus.publish(ctx.projectId, {
      type: "message.tool.result",
      payload: {
        sessionId: input.sessionId,
        messageId: part?.messageId ?? "",
        partId: part?.id ?? "",
        toolCallId: input.toolCallId,
        result: input.reason ?? "rejected",
      },
    });

    return { rejected: true };
  },
};
