/**
 * Message Queue Processor
 *
 * Processes queued messages sequentially per session to prevent concurrent
 * processing and ensure proper message ordering.
 */

import type { Database } from "bun:sqlite";
import { MessageQueueService } from "./message-queue.ts";
import { SessionService } from "./sessions.ts";
import { ProjectService } from "./projects.ts";
import { AgentOrchestrator } from "@/agents/orchestrator.ts";
import { CredentialResolver } from "@/agents/credential-resolver.ts";
import { DatabaseManager } from "@/database/index.ts";
import type { ProviderId } from "@/agents/types.ts";
import { EventBus } from "@/bus/index.ts";

// ============================================================================
// Types
// ============================================================================

interface ProcessingSession {
  sessionId: string;
  projectId: string;
  abortController: AbortController;
  timeoutId: NodeJS.Timeout;
}

// ============================================================================
// Processor
// ============================================================================

export class MessageQueueProcessor {
  private static instance: MessageQueueProcessor | null = null;
  private processingSessions = new Map<string, ProcessingSession>();
  private processingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): MessageQueueProcessor {
    if (!MessageQueueProcessor.instance) {
      MessageQueueProcessor.instance = new MessageQueueProcessor();
    }
    return MessageQueueProcessor.instance;
  }

  /**
   * Start the queue processor
   */
  start(intervalMs: number = 1000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log("[MessageQueueProcessor] Starting queue processor");

    this.processingInterval = setInterval(() => {
      this.processQueues().catch((err) => {
        console.error("[MessageQueueProcessor] Error processing queues:", err);
      });
    }, intervalMs);

    // Also process immediately
    this.processQueues().catch((err) => {
      console.error("[MessageQueueProcessor] Error in initial queue processing:", err);
    });
  }

  /**
   * Stop the queue processor
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    console.log("[MessageQueueProcessor] Stopping queue processor");

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Cancel all active processing
    for (const [sessionId, session] of this.processingSessions) {
      session.abortController.abort();
      clearTimeout(session.timeoutId);
    }
    this.processingSessions.clear();
  }

  /**
   * Process all project queues
   */
  private async processQueues(): Promise<void> {
    const rootDb = DatabaseManager.getRootDb();
    
    // Get all projects
    const projects = ProjectService.list(rootDb);

    for (const project of projects) {
      try {
        await this.processProjectQueue(project.id);
      } catch (err) {
        console.error(`[MessageQueueProcessor] Error processing project ${project.id}:`, err);
      }
    }
  }

  /**
   * Process queue for a specific project
   */
  private async processProjectQueue(projectId: string): Promise<void> {
    const db = DatabaseManager.getProjectDb(projectId);

    // Get all sessions with pending messages that aren't currently being processed
    const sessions = db.prepare(`
      SELECT DISTINCT session_id 
      FROM message_queue 
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all() as { session_id: string }[];

    for (const { session_id: sessionId } of sessions) {
      // Skip if already processing this session
      if (this.processingSessions.has(sessionId)) {
        continue;
      }

      // Check if session is busy (has processing messages)
      if (MessageQueueService.isSessionBusy(db, sessionId)) {
        continue;
      }

      // Get next pending message for this session
      const queuedMessage = MessageQueueService.getNextPending(db, sessionId);
      if (!queuedMessage) {
        continue;
      }

      // Start processing this message
      this.processMessage(projectId, queuedMessage.id).catch((err) => {
        console.error(`[MessageQueueProcessor] Error processing message ${queuedMessage.id}:`, err);
      });
    }
  }

  /**
   * Process a specific queued message
   */
  private async processMessage(projectId: string, messageId: string): Promise<void> {
    const db = DatabaseManager.getProjectDb(projectId);
    const rootDb = DatabaseManager.getRootDb();

    // Get the queued message
    const queuedMessage = MessageQueueService.getById(db, messageId);
    if (!queuedMessage || queuedMessage.status !== "pending") {
      return;
    }

    // Mark as processing
    MessageQueueService.markProcessing(db, messageId);

    // Create abort controller and timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 10 * 60 * 1000); // 10 minute timeout

    // Track processing session
    this.processingSessions.set(queuedMessage.sessionId, {
      sessionId: queuedMessage.sessionId,
      projectId,
      abortController,
      timeoutId,
    });

    try {
      // Get project info
      const project = ProjectService.getByIdOrThrow(rootDb, projectId);
      const projectPath = project.path || process.cwd();

      // Get session info
      const session = SessionService.getByIdOrThrow(db, queuedMessage.sessionId);

      // Determine provider and model
      const providerId = (queuedMessage.providerId || session.providerId || "anthropic") as ProviderId;
      const modelId = queuedMessage.modelId || session.modelId || null;

      // Create credential resolver
      const credentialResolver = new CredentialResolver(
        queuedMessage.userId,
        providerId,
        queuedMessage.apiKey
      );

      // Validate credentials
      try {
        credentialResolver.resolve();
      } catch {
        throw new Error(`No API key found for provider "${providerId}"`);
      }

      // Create interrupt-aware abort controller
      const interruptCheckAbortController = new AbortController();
      
      // Set up interrupt checking interval
      const interruptCheckInterval = setInterval(() => {
        if (MessageQueueService.isInterruptRequested(db, messageId)) {
          console.log(`[MessageQueueProcessor] Interrupt requested for message ${messageId}`);
          interruptCheckAbortController.abort();
        }
      }, 1000); // Check every second

      // Chain abort signals - abort if either timeout or interrupt requested
      const chainedAbortController = new AbortController();
      
      const abortOnTimeout = () => chainedAbortController.abort();
      const abortOnInterrupt = () => chainedAbortController.abort();
      
      abortController.signal.addEventListener('abort', abortOnTimeout);
      interruptCheckAbortController.signal.addEventListener('abort', abortOnInterrupt);

      try {
        // Run agent orchestration with interrupt-aware abort signal
        const result = await AgentOrchestrator.run({
          db,
          projectId,
          projectPath,
          sessionId: queuedMessage.sessionId,
          userId: queuedMessage.userId,
          canExecuteCode: queuedMessage.canExecuteCode,
          enabledTools: queuedMessage.enabledTools,
          content: queuedMessage.content,
          credentialResolver,
          providerId,
          modelId,
          agentName: queuedMessage.agentName || session.agent,
          abortSignal: chainedAbortController.signal,
          existingUserMessageId: queuedMessage.userMessageId,
        });

        clearInterval(interruptCheckInterval);

        // Check if we were interrupted after completion
        if (MessageQueueService.isInterruptRequested(db, messageId)) {
          MessageQueueService.markInterrupted(db, messageId);
          console.log(`[MessageQueueProcessor] Message ${messageId} was interrupted during processing`);
          return;
        }

        // Mark as completed
        MessageQueueService.markCompleted(db, messageId);

        console.log(`[MessageQueueProcessor] Successfully processed message ${messageId} for session ${queuedMessage.sessionId}`);

        // Emit completion event with result
        EventBus.publish("message.queue.processed", {
          sessionId: queuedMessage.sessionId,
          messageId,
          resultMessageId: result.messageId,
          usage: result.usage,
          cost: result.cost,
          finishReason: result.finishReason,
        });
      } catch (err) {
        clearInterval(interruptCheckInterval);
        
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        
        // Check if this was an interrupt
        if (interruptCheckAbortController.signal.aborted && MessageQueueService.isInterruptRequested(db, messageId)) {
          MessageQueueService.markInterrupted(db, messageId);
          console.log(`[MessageQueueProcessor] Message ${messageId} was interrupted`);
        }
        // Check if this was a timeout or cancellation
        else if (abortController.signal.aborted) {
          MessageQueueService.markFailed(db, messageId, "Processing timed out or was cancelled");
        } else {
          MessageQueueService.markFailed(db, messageId, errorMessage);
        }

        console.error(`[MessageQueueProcessor] Failed to process message ${messageId}:`, errorMessage);

        // Emit failure event
        EventBus.publish("message.queue.failed", {
          sessionId: queuedMessage.sessionId,
          messageId,
          error: errorMessage,
        });
      }

    } catch (err) {
      clearInterval(interruptCheckInterval);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      
      // Check if this was an interrupt
      if (MessageQueueService.isInterruptRequested(db, messageId)) {
        MessageQueueService.markInterrupted(db, messageId);
        console.log(`[MessageQueueProcessor] Message ${messageId} was interrupted`);
      }
      // Check if this was an abort (timeout or cancellation)
      else if (abortController.signal.aborted) {
        MessageQueueService.markFailed(db, messageId, "Processing timed out or was cancelled");
      } else {
        MessageQueueService.markFailed(db, messageId, errorMessage);
      }

      console.error(`[MessageQueueProcessor] Failed to process message ${messageId}:`, errorMessage);

      // Emit failure event
      EventBus.publish("message.queue.failed", {
        sessionId: queuedMessage.sessionId,
        messageId,
        error: errorMessage,
      });

    } finally {
      // Clean up
      clearTimeout(timeoutId);
      this.processingSessions.delete(queuedMessage.sessionId);
    }
  }

  /**
   * Cancel processing for a specific session
   */
  cancelSession(sessionId: string): boolean {
    const session = this.processingSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.abortController.abort();
    clearTimeout(session.timeoutId);
    this.processingSessions.delete(sessionId);

    console.log(`[MessageQueueProcessor] Cancelled processing for session ${sessionId}`);
    return true;
  }

  /**
   * Get processing status for a session
   */
  getSessionStatus(sessionId: string): "idle" | "processing" {
    return this.processingSessions.has(sessionId) ? "processing" : "idle";
  }

  /**
   * Get all currently processing sessions
   */
  getProcessingSessions(): string[] {
    return Array.from(this.processingSessions.keys());
  }

  /**
   * Force process a specific message (bypass queue order)
   */
  async forceProcessMessage(projectId: string, messageId: string): Promise<void> {
    await this.processMessage(projectId, messageId);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const messageQueueProcessor = MessageQueueProcessor.getInstance();