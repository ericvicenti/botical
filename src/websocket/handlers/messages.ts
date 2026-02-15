/**
 * Message Request Handlers
 *
 * Handles WebSocket requests for message operations.
 * See: docs/implementation-plan/05-realtime-communication.md#request-handlers
 */

import {
  MessageSendPayload,
  MessageCancelPayload,
  MessageRetryPayload,
  createEvent,
} from "../protocol.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { MessageQueueService } from "@/services/message-queue.ts";
import { messageQueueProcessor } from "@/services/message-queue-processor.ts";
import { ProviderCredentialsService } from "@/services/provider-credentials.ts";
import { AgentOrchestrator } from "@/agents/orchestrator.ts";
import { CredentialResolver } from "@/agents/credential-resolver.ts";
import { EventBus } from "@/bus/index.ts";
import type { WSData } from "../connections.ts";
import type { ProviderId } from "@/agents/types.ts";
import { extractTextContent } from "@/services/message-content.ts";

/**
 * Get project path from projects table
 */
function getProjectPath(projectId: string): string {
  const rootDb = DatabaseManager.getRootDb();
  const project = rootDb
    .prepare("SELECT path FROM projects WHERE id = ?")
    .get(projectId) as { path: string | null } | undefined;

  return project?.path ?? process.cwd();
}

/**
 * Message handlers for WebSocket requests
 */
export const MessageHandlers = {
  /**
   * Send a message to the agent
   */
  async send(payload: unknown, ctx: WSData) {
    const input = MessageSendPayload.parse(payload);
    // Use projectId from payload if provided, otherwise fall back to context
    const projectId = input.projectId ?? ctx.projectId;
    const db = DatabaseManager.getProjectDb(projectId);

    // Get session to determine provider
    const session = SessionService.getByIdOrThrow(db, input.sessionId);

    // Determine provider: session config > find any available credential
    let providerId: ProviderId =
      (session.providerId as ProviderId) ?? "anthropic";

    // Create credential resolver — try configured provider first
    let credentialResolver: CredentialResolver;
    try {
      credentialResolver = new CredentialResolver(ctx.userId, providerId);
      credentialResolver.resolve();
    } catch {
      // No key for default provider — try finding any configured provider
      const FALLBACK_PROVIDERS: ProviderId[] = ["anthropic-oauth", "anthropic", "openai", "google", "ollama"];
      let found = false;
      for (const fallback of FALLBACK_PROVIDERS) {
        try {
          credentialResolver = new CredentialResolver(ctx.userId, fallback);
          credentialResolver.resolve();
          providerId = fallback;
          found = true;
          break;
        } catch { continue; }
      }
      if (!found) {
        throw new Error(`No API key configured for any provider. Please add credentials.`);
      }
    }

    // Enqueue the message for processing
    const queuedMessage = MessageQueueService.enqueue(db, {
      sessionId: input.sessionId,
      userId: ctx.userId,
      content: input.content,
      providerId,
      modelId: session.modelId,
      canExecuteCode: true, // TODO: Get from user auth context
    });

    // Get queue position for user feedback
    const queuePosition = MessageQueueService.getQueuePosition(db, input.sessionId, queuedMessage.id);
    const queueLength = MessageQueueService.getQueueLength(db, input.sessionId);

    return {
      queuedMessageId: queuedMessage.id,
      status: "queued",
      queuePosition,
      queueLength,
      message: "Message queued for processing",
    };
  },

  /**
   * Cancel an active message stream or queued messages
   */
  async cancel(payload: unknown, ctx: WSData) {
    const input = MessageCancelPayload.parse(payload);
    const db = DatabaseManager.getProjectDb(ctx.projectId);

    // Try to cancel active processing first
    const wasCancelledFromProcessor = messageQueueProcessor.cancelSession(input.sessionId);

    // Cancel any pending messages in the queue
    const pendingMessages = MessageQueueService.listBySession(db, input.sessionId, { status: "pending" });
    let cancelledCount = 0;

    for (const message of pendingMessages) {
      MessageQueueService.cancel(db, message.id);
      cancelledCount++;
    }

    return { 
      cancelled: true,
      cancelledProcessing: wasCancelledFromProcessor,
      cancelledQueued: cancelledCount,
    };
  },

  /**
   * Retry a message from a specific point
   */
  async retry(payload: unknown, ctx: WSData) {
    const input = MessageRetryPayload.parse(payload);
    const db = DatabaseManager.getProjectDb(ctx.projectId);

    // Get the original user message
    const message = MessageService.getById(db, input.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    if (message.role !== "user") {
      throw new Error("Can only retry from a user message");
    }

    // Get the message content
    const parts = MessagePartService.listByMessage(db, input.messageId);
    const textParts = parts.filter((p) => p.type === "text");
    if (textParts.length === 0) {
      throw new Error("Message has no text content");
    }

    const content = textParts
      .map((p) => extractTextContent(p.content))
      .join("\n");

    // Delete subsequent messages (assistant responses after this user message)
    // We identify them by having created_at > this message's created_at
    const subsequentMessages = db
      .prepare(
        "SELECT id FROM messages WHERE session_id = ? AND created_at > ?"
      )
      .all(input.sessionId, message.createdAt) as { id: string }[];

    for (const msg of subsequentMessages) {
      MessageService.delete(db, msg.id);
    }

    // Re-send the message
    return MessageHandlers.send(
      { sessionId: input.sessionId, content },
      ctx
    );
  },
};
