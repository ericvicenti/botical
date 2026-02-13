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
import { ProviderCredentialsService } from "@/services/provider-credentials.ts";
import { AgentOrchestrator } from "@/agents/orchestrator.ts";
import { CredentialResolver } from "@/agents/credential-resolver.ts";
import { EventBus } from "@/bus/index.ts";
import type { WSData } from "../connections.ts";
import type { ProviderId } from "@/agents/types.ts";
import { extractTextContent } from "@/services/message-content.ts";

// Map of active abort controllers by sessionId
const activeStreams = new Map<string, AbortController>();

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

    // Get project path
    const projectPath = getProjectPath(projectId);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    activeStreams.set(input.sessionId, abortController);

    try {
      // Run the orchestrator
      const result = await AgentOrchestrator.run({
        db,
        projectId,
        projectPath,
        sessionId: input.sessionId,
        userId: ctx.userId,
        canExecuteCode: true, // TODO: Get from user auth context
        content: input.content,
        credentialResolver,
        providerId,
        modelId: session.modelId,
        abortSignal: abortController.signal,
        onEvent: async (event) => {
          // Events are automatically published via EventBus by StreamProcessor
          // The bus-bridge will forward them to WebSocket clients
        },
      });

      return {
        messageId: result.messageId,
        finishReason: result.finishReason,
        usage: result.usage,
      };
    } finally {
      activeStreams.delete(input.sessionId);
    }
  },

  /**
   * Cancel an active message stream
   */
  async cancel(payload: unknown, ctx: WSData) {
    const input = MessageCancelPayload.parse(payload);

    const abortController = activeStreams.get(input.sessionId);
    if (abortController) {
      abortController.abort();
      activeStreams.delete(input.sessionId);
    }

    return { cancelled: true };
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
