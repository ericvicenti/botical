/**
 * Message Queue Service
 *
 * Server-side message queuing to prevent message loss and ensure proper
 * sequential processing of messages within a session.
 *
 * Features:
 * - Server-side persistence (messages survive page refreshes)
 * - Sequential processing per session (no concurrent processing)
 * - Automatic retry on failure
 * - Queue status tracking
 */

import type { Database } from "bun:sqlite";
import { generateId } from "@/utils/id.ts";
import { NotFoundError } from "@/utils/errors.ts";
import { EventBus } from "@/bus/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface QueuedMessageRecord {
  id: string;
  session_id: string;
  user_id: string;
  user_message_id: string | null;
  content: string;
  provider_id: string | null;
  model_id: string | null;
  agent_name: string | null;
  can_execute_code: number;
  enabled_tools: string | null; // JSON array
  api_key: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "interrupted";
  retry_count: number;
  error_message: string | null;
  interrupt_requested: number;
  interrupted_at: number | null;
  can_interrupt: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

export interface QueuedMessage {
  id: string;
  sessionId: string;
  userId: string;
  userMessageId?: string;
  content: string;
  providerId?: string;
  modelId?: string;
  agentName?: string;
  canExecuteCode: boolean;
  enabledTools?: string[];
  apiKey?: string;
  status: "pending" | "processing" | "completed" | "failed" | "interrupted";
  retryCount: number;
  errorMessage?: string;
  interruptRequested: boolean;
  interruptedAt?: number;
  canInterrupt: boolean;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface EnqueueMessageParams {
  sessionId: string;
  userId: string;
  userMessageId?: string;
  content: string;
  providerId?: string;
  modelId?: string;
  agentName?: string;
  canExecuteCode?: boolean;
  enabledTools?: string[];
  apiKey?: string;
  canInterrupt?: boolean;
}

// ============================================================================
// Service
// ============================================================================

export const MessageQueueService = {
  /**
   * Enqueue a message for processing
   */
  enqueue(db: Database, params: EnqueueMessageParams): QueuedMessage {
    const id = generateId("qmsg");
    const now = Date.now();

    db.prepare(
      `INSERT INTO message_queue (
        id, session_id, user_id, user_message_id, content, provider_id, model_id, agent_name,
        can_execute_code, enabled_tools, api_key, status, retry_count, can_interrupt,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.sessionId,
      params.userId,
      params.userMessageId || null,
      params.content,
      params.providerId || null,
      params.modelId || null,
      params.agentName || null,
      params.canExecuteCode ? 1 : 0,
      params.enabledTools ? JSON.stringify(params.enabledTools) : null,
      params.apiKey || null,
      "pending",
      0,
      params.canInterrupt !== false ? 1 : 0,
      now
    );

    const message = this.getByIdOrThrow(db, id);

    // Emit queue event
    EventBus.publish("message.queued", {
      sessionId: params.sessionId,
      messageId: id,
      queuePosition: this.getQueuePosition(db, params.sessionId, id),
    });

    return message;
  },

  /**
   * Get queued message by ID
   */
  getById(db: Database, id: string): QueuedMessage | null {
    const row = db
      .prepare("SELECT * FROM message_queue WHERE id = ?")
      .get(id) as QueuedMessageRecord | undefined;

    if (!row) return null;
    return this.recordToQueuedMessage(row);
  },

  /**
   * Get queued message by ID or throw
   */
  getByIdOrThrow(db: Database, id: string): QueuedMessage {
    const message = this.getById(db, id);
    if (!message) {
      throw new NotFoundError("Queued message", id);
    }
    return message;
  },

  /**
   * Get next pending message for a session
   */
  getNextPending(db: Database, sessionId: string): QueuedMessage | null {
    const row = db
      .prepare(
        `SELECT * FROM message_queue 
         WHERE session_id = ? AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get(sessionId) as QueuedMessageRecord | undefined;

    if (!row) return null;
    return this.recordToQueuedMessage(row);
  },

  /**
   * Get currently processing message for a session
   */
  getProcessing(db: Database, sessionId: string): QueuedMessage | null {
    const row = db
      .prepare(
        `SELECT * FROM message_queue 
         WHERE session_id = ? AND status = 'processing'
         LIMIT 1`
      )
      .get(sessionId) as QueuedMessageRecord | undefined;

    if (!row) return null;
    return this.recordToQueuedMessage(row);
  },

  /**
   * List all queued messages for a session
   */
  listBySession(
    db: Database,
    sessionId: string,
    options: { status?: string; limit?: number; offset?: number } = {}
  ): QueuedMessage[] {
    const { status, limit = 50, offset = 0 } = options;

    let query = `SELECT * FROM message_queue WHERE session_id = ?`;
    const params: unknown[] = [sessionId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as QueuedMessageRecord[];
    return rows.map(row => this.recordToQueuedMessage(row));
  },

  /**
   * Get queue position for a message (1-based)
   */
  getQueuePosition(db: Database, sessionId: string, messageId: string): number {
    const result = db
      .prepare(
        `SELECT COUNT(*) as position FROM message_queue 
         WHERE session_id = ? AND status = 'pending' 
         AND created_at <= (
           SELECT created_at FROM message_queue 
           WHERE id = ? AND session_id = ?
         )`
      )
      .get(sessionId, messageId, sessionId) as { position: number } | undefined;

    return result?.position || 0;
  },

  /**
   * Get queue length for a session
   */
  getQueueLength(db: Database, sessionId: string): number {
    const result = db
      .prepare(
        `SELECT COUNT(*) as count FROM message_queue 
         WHERE session_id = ? AND status = 'pending'`
      )
      .get(sessionId) as { count: number } | undefined;

    return result?.count || 0;
  },

  /**
   * Mark message as processing
   */
  markProcessing(db: Database, id: string): QueuedMessage {
    const now = Date.now();

    db.prepare(
      `UPDATE message_queue 
       SET status = 'processing', started_at = ?
       WHERE id = ? AND status = 'pending'`
    ).run(now, id);

    const message = this.getByIdOrThrow(db, id);

    // Emit processing event
    EventBus.publish("message.processing", {
      sessionId: message.sessionId,
      messageId: id,
    });

    return message;
  },

  /**
   * Mark message as completed
   */
  markCompleted(db: Database, id: string): QueuedMessage {
    const now = Date.now();

    db.prepare(
      `UPDATE message_queue 
       SET status = 'completed', completed_at = ?
       WHERE id = ?`
    ).run(now, id);

    const message = this.getByIdOrThrow(db, id);

    // Emit completed event
    EventBus.publish("message.completed", {
      sessionId: message.sessionId,
      messageId: id,
    });

    return message;
  },

  /**
   * Mark message as failed
   */
  markFailed(db: Database, id: string, errorMessage: string): QueuedMessage {
    const now = Date.now();

    db.prepare(
      `UPDATE message_queue 
       SET status = 'failed', error_message = ?, completed_at = ?
       WHERE id = ?`
    ).run(errorMessage, now, id);

    const message = this.getByIdOrThrow(db, id);

    // Emit failed event
    EventBus.publish("message.failed", {
      sessionId: message.sessionId,
      messageId: id,
      error: errorMessage,
    });

    return message;
  },

  /**
   * Retry a failed message
   */
  retry(db: Database, id: string): QueuedMessage {
    db.prepare(
      `UPDATE message_queue 
       SET status = 'pending', retry_count = retry_count + 1, 
           error_message = NULL, started_at = NULL, completed_at = NULL
       WHERE id = ? AND status = 'failed'`
    ).run(id);

    const message = this.getByIdOrThrow(db, id);

    // Emit retry event
    EventBus.publish("message.retried", {
      sessionId: message.sessionId,
      messageId: id,
      retryCount: message.retryCount,
    });

    return message;
  },

  /**
   * Cancel a pending message
   */
  cancel(db: Database, id: string): QueuedMessage {
    db.prepare(
      `UPDATE message_queue 
       SET status = 'failed', error_message = 'Cancelled by user', completed_at = ?
       WHERE id = ? AND status = 'pending'`
    ).run(Date.now(), id);

    const message = this.getByIdOrThrow(db, id);

    // Emit cancelled event
    EventBus.publish("message.cancelled", {
      sessionId: message.sessionId,
      messageId: id,
    });

    return message;
  },

  /**
   * Clean up old completed/failed messages
   */
  cleanup(db: Database, olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThanMs;

    const result = db.prepare(
      `DELETE FROM message_queue 
       WHERE status IN ('completed', 'failed') 
       AND completed_at < ?`
    ).run(cutoff);

    return result.changes;
  },

  /**
   * Check if session has any active processing
   */
  isSessionBusy(db: Database, sessionId: string): boolean {
    const result = db
      .prepare(
        `SELECT COUNT(*) as count FROM message_queue 
         WHERE session_id = ? AND status = 'processing'`
      )
      .get(sessionId) as { count: number } | undefined;

    return (result?.count || 0) > 0;
  },

  /**
   * Request interrupt for currently processing message in a session
   */
  requestInterrupt(db: Database, sessionId: string): boolean {
    const result = db.prepare(
      `UPDATE message_queue 
       SET interrupt_requested = 1, interrupted_at = ?
       WHERE session_id = ? AND status = 'processing' AND can_interrupt = 1`
    ).run(Date.now(), sessionId);

    if (result.changes > 0) {
      // Emit interrupt event
      EventBus.publish("message.interrupt.requested", {
        sessionId,
      });
      return true;
    }
    return false;
  },

  /**
   * Check if interrupt was requested for a message
   */
  isInterruptRequested(db: Database, messageId: string): boolean {
    const result = db
      .prepare("SELECT interrupt_requested FROM message_queue WHERE id = ?")
      .get(messageId) as { interrupt_requested: number } | undefined;

    return Boolean(result?.interrupt_requested);
  },

  /**
   * Mark message as interrupted
   */
  markInterrupted(db: Database, id: string): QueuedMessage {
    const now = Date.now();

    db.prepare(
      `UPDATE message_queue 
       SET status = 'interrupted', completed_at = ?
       WHERE id = ?`
    ).run(now, id);

    const message = this.getByIdOrThrow(db, id);

    // Emit interrupted event
    EventBus.publish("message.interrupted", {
      sessionId: message.sessionId,
      messageId: id,
    });

    return message;
  },

  /**
   * Convert database record to QueuedMessage
   */
  recordToQueuedMessage(record: QueuedMessageRecord): QueuedMessage {
    return {
      id: record.id,
      sessionId: record.session_id,
      userId: record.user_id,
      userMessageId: record.user_message_id || undefined,
      content: record.content,
      providerId: record.provider_id || undefined,
      modelId: record.model_id || undefined,
      agentName: record.agent_name || undefined,
      canExecuteCode: Boolean(record.can_execute_code),
      enabledTools: record.enabled_tools ? JSON.parse(record.enabled_tools) : undefined,
      apiKey: record.api_key || undefined,
      status: record.status,
      retryCount: record.retry_count,
      errorMessage: record.error_message || undefined,
      interruptRequested: Boolean(record.interrupt_requested),
      interruptedAt: record.interrupted_at || undefined,
      canInterrupt: Boolean(record.can_interrupt),
      createdAt: record.created_at,
      startedAt: record.started_at || undefined,
      completedAt: record.completed_at || undefined,
    };
  },
};