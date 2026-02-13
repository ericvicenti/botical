/**
 * Heartbeat Wrapper
 *
 * Direct wrapper for heartbeat actions that bypasses the ActionRegistry.
 * Used by the scheduler when ActionRegistry has issues.
 */

import { DatabaseManager } from "@/database/index.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";

export interface HeartbeatResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * Execute the Leopard heartbeat directly
 */
export async function executeLeopardHeartbeat(
  projectId: string = "prj_root",
  message?: string
): Promise<HeartbeatResult> {
  try {
    const db = DatabaseManager.getProjectDb(projectId);
    
    // Create a new session for the leopard agent
    const session = SessionService.create(db, {
      title: `Leopard Heartbeat - ${new Date().toISOString().slice(0, 10)}`,
      agent: "leopard",
    });

    // Default heartbeat message
    const heartbeatMessage = message || `Read PRIORITIES.md. Check CHANGELOG-AUTO.md for recent work. Run tests (bun test). Pick the highest priority item and make one small improvement. Commit and deploy if tests pass.`;

    // Create the user message
    const userMessage = MessageService.create(db, {
      sessionId: session.id,
      role: "user",
    });

    // Add the text content
    MessagePartService.create(db, {
      messageId: userMessage.id,
      sessionId: session.id,
      type: "text",
      content: heartbeatMessage,
    });

    return {
      success: true,
      sessionId: session.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}