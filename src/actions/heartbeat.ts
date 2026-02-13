/**
 * Heartbeat Actions
 *
 * Actions for managing the Leopard self-improvement heartbeat system.
 * Creates sessions and sends improvement messages to the leopard agent.
 */

import { z } from "zod";
import { defineAction, success, error } from "./types.ts";
import { DatabaseManager } from "@/database/index.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";

/**
 * heartbeat.leopard - Send heartbeat message to Leopard agent
 *
 * Creates a new session with the leopard agent and sends the improvement prompt.
 * This action is designed to be triggered by the scheduler every 2 hours.
 */
export const leopardHeartbeat = defineAction({
  id: "heartbeat.leopard",
  label: "Leopard Heartbeat",
  description: "Send improvement cycle trigger to Leopard agent",
  category: "service",
  icon: "heart",

  params: z.object({
    projectId: z.string().optional().describe("Project ID (defaults to prj_root)"),
    message: z.string().optional().describe("Custom heartbeat message"),
  }),

  execute: async ({ projectId = "prj_root", message }, context) => {
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

      return success(
        "Leopard Heartbeat Sent", 
        `Created heartbeat session ${session.id} for leopard agent`
      );
    } catch (err) {
      return error(`Failed to create leopard heartbeat: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  },
});

/**
 * All heartbeat actions
 */
export const heartbeatActions = [
  leopardHeartbeat,
];