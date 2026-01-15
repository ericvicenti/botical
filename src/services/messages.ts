/**
 * Message Service
 *
 * Manages messages and message parts within sessions.
 * Messages represent exchanges in a conversation, with parts
 * storing different content types (text, tool calls, files).
 * See: docs/knowledge-base/02-data-model.md#message
 * See: docs/knowledge-base/02-data-model.md#message-part
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";
import type {
  MessageRole,
  FinishReason,
  PartType,
  ToolStatus,
} from "@/agents/types.ts";

/**
 * Message creation input schema
 */
export const MessageCreateSchema = z.object({
  sessionId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  parentId: z.string().nullable().optional(),
  providerId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  agent: z.string().nullable().optional(),
});

export type MessageCreateInput = z.infer<typeof MessageCreateSchema>;

/**
 * Message entity
 */
export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  parentId: string | null;
  providerId: string | null;
  modelId: string | null;
  agent: string | null;
  finishReason: FinishReason | null;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: number;
  completedAt: number | null;
}

/**
 * Message database row
 */
interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  parent_id: string | null;
  provider_id: string | null;
  model_id: string | null;
  agent: string | null;
  finish_reason: string | null;
  cost: number;
  tokens_input: number;
  tokens_output: number;
  tokens_reasoning: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  error_type: string | null;
  error_message: string | null;
  created_at: number;
  completed_at: number | null;
}

/**
 * Message part creation input schema
 */
export const MessagePartCreateSchema = z.object({
  messageId: z.string(),
  sessionId: z.string(),
  type: z.enum([
    "text",
    "reasoning",
    "tool-call",
    "tool-result",
    "file",
    "step-start",
    "step-finish",
  ]),
  content: z.unknown(),
  toolName: z.string().nullable().optional(),
  toolCallId: z.string().nullable().optional(),
  toolStatus: z.enum(["pending", "running", "completed", "error"]).nullable().optional(),
});

export type MessagePartCreateInput = z.infer<typeof MessagePartCreateSchema>;

/**
 * Message part entity
 */
export interface MessagePart {
  id: string;
  messageId: string;
  sessionId: string;
  type: PartType;
  content: unknown;
  toolName: string | null;
  toolCallId: string | null;
  toolStatus: ToolStatus | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Message part database row
 */
interface MessagePartRow {
  id: string;
  message_id: string;
  session_id: string;
  type: string;
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  tool_status: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Convert database row to message entity
 */
function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as MessageRole,
    parentId: row.parent_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    agent: row.agent,
    finishReason: row.finish_reason as FinishReason | null,
    cost: row.cost,
    tokensInput: row.tokens_input,
    tokensOutput: row.tokens_output,
    tokensReasoning: row.tokens_reasoning,
    tokensCacheRead: row.tokens_cache_read,
    tokensCacheWrite: row.tokens_cache_write,
    errorType: row.error_type,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

/**
 * Convert database row to message part entity
 */
function rowToMessagePart(row: MessagePartRow): MessagePart {
  return {
    id: row.id,
    messageId: row.message_id,
    sessionId: row.session_id,
    type: row.type as PartType,
    content: JSON.parse(row.content),
    toolName: row.tool_name,
    toolCallId: row.tool_call_id,
    toolStatus: row.tool_status as ToolStatus | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Message Service for managing conversation messages
 */
export class MessageService {
  /**
   * Create a new message
   */
  static create(db: Database, input: MessageCreateInput): Message {
    const validated = MessageCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.message);

    db.prepare(
      `
      INSERT INTO messages (
        id, session_id, role, parent_id, provider_id, model_id, agent,
        cost, tokens_input, tokens_output, tokens_reasoning,
        tokens_cache_read, tokens_cache_write, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      validated.sessionId,
      validated.role,
      validated.parentId ?? null,
      validated.providerId ?? null,
      validated.modelId ?? null,
      validated.agent ?? null,
      0,
      0,
      0,
      0,
      0,
      0,
      now
    );

    return {
      id,
      sessionId: validated.sessionId,
      role: validated.role,
      parentId: validated.parentId ?? null,
      providerId: validated.providerId ?? null,
      modelId: validated.modelId ?? null,
      agent: validated.agent ?? null,
      finishReason: null,
      cost: 0,
      tokensInput: 0,
      tokensOutput: 0,
      tokensReasoning: 0,
      tokensCacheRead: 0,
      tokensCacheWrite: 0,
      errorType: null,
      errorMessage: null,
      createdAt: now,
      completedAt: null,
    };
  }

  /**
   * Get a message by ID
   */
  static getById(db: Database, messageId: string): Message | null {
    const row = db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .get(messageId) as MessageRow | undefined;

    if (!row) return null;
    return rowToMessage(row);
  }

  /**
   * Get a message by ID or throw NotFoundError
   */
  static getByIdOrThrow(db: Database, messageId: string): Message {
    const message = this.getById(db, messageId);
    if (!message) {
      throw new NotFoundError("Message", messageId);
    }
    return message;
  }

  /**
   * List messages for a session
   */
  static listBySession(
    db: Database,
    sessionId: string,
    options: {
      role?: MessageRole;
      limit?: number;
      offset?: number;
    } = {}
  ): Message[] {
    let query = "SELECT * FROM messages WHERE session_id = ?";
    const params: (string | number)[] = [sessionId];

    if (options.role) {
      query += " AND role = ?";
      params.push(options.role);
    }

    // Order by ID ascending (chronological for ascending ID generation)
    query += " ORDER BY id ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as MessageRow[];
    return rows.map(rowToMessage);
  }

  /**
   * Complete a message with final stats
   */
  static complete(
    db: Database,
    messageId: string,
    stats: {
      finishReason: FinishReason;
      cost?: number;
      tokensInput?: number;
      tokensOutput?: number;
      tokensReasoning?: number;
      tokensCacheRead?: number;
      tokensCacheWrite?: number;
    }
  ): Message {
    const now = Date.now();

    db.prepare(
      `
      UPDATE messages SET
        finish_reason = ?,
        cost = ?,
        tokens_input = ?,
        tokens_output = ?,
        tokens_reasoning = ?,
        tokens_cache_read = ?,
        tokens_cache_write = ?,
        completed_at = ?
      WHERE id = ?
    `
    ).run(
      stats.finishReason,
      stats.cost ?? 0,
      stats.tokensInput ?? 0,
      stats.tokensOutput ?? 0,
      stats.tokensReasoning ?? 0,
      stats.tokensCacheRead ?? 0,
      stats.tokensCacheWrite ?? 0,
      now,
      messageId
    );

    return this.getByIdOrThrow(db, messageId);
  }

  /**
   * Mark a message as errored
   */
  static setError(
    db: Database,
    messageId: string,
    error: {
      type: string;
      message: string;
    }
  ): Message {
    const now = Date.now();

    db.prepare(
      `
      UPDATE messages SET
        finish_reason = 'error',
        error_type = ?,
        error_message = ?,
        completed_at = ?
      WHERE id = ?
    `
    ).run(error.type, error.message, now, messageId);

    return this.getByIdOrThrow(db, messageId);
  }

  /**
   * Delete a message
   */
  static delete(db: Database, messageId: string): void {
    this.getByIdOrThrow(db, messageId);

    // Delete parts first
    db.prepare("DELETE FROM message_parts WHERE message_id = ?").run(messageId);
    db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
  }

  /**
   * Count messages for a session
   */
  static countBySession(db: Database, sessionId: string): number {
    const result = db
      .prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = ?")
      .get(sessionId) as { count: number };
    return result.count;
  }
}

/**
 * Message Part Service for managing message content parts
 */
export class MessagePartService {
  /**
   * Create a new message part
   */
  static create(db: Database, input: MessagePartCreateInput): MessagePart {
    const validated = MessagePartCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.part);

    db.prepare(
      `
      INSERT INTO message_parts (
        id, message_id, session_id, type, content,
        tool_name, tool_call_id, tool_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      validated.messageId,
      validated.sessionId,
      validated.type,
      JSON.stringify(validated.content),
      validated.toolName ?? null,
      validated.toolCallId ?? null,
      validated.toolStatus ?? null,
      now,
      now
    );

    return {
      id,
      messageId: validated.messageId,
      sessionId: validated.sessionId,
      type: validated.type,
      content: validated.content,
      toolName: validated.toolName ?? null,
      toolCallId: validated.toolCallId ?? null,
      toolStatus: validated.toolStatus ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get a message part by ID
   */
  static getById(db: Database, partId: string): MessagePart | null {
    const row = db
      .prepare("SELECT * FROM message_parts WHERE id = ?")
      .get(partId) as MessagePartRow | undefined;

    if (!row) return null;
    return rowToMessagePart(row);
  }

  /**
   * Get a message part by ID or throw NotFoundError
   */
  static getByIdOrThrow(db: Database, partId: string): MessagePart {
    const part = this.getById(db, partId);
    if (!part) {
      throw new NotFoundError("MessagePart", partId);
    }
    return part;
  }

  /**
   * List parts for a message
   */
  static listByMessage(db: Database, messageId: string): MessagePart[] {
    const rows = db
      .prepare(
        "SELECT * FROM message_parts WHERE message_id = ? ORDER BY id ASC"
      )
      .all(messageId) as MessagePartRow[];
    return rows.map(rowToMessagePart);
  }

  /**
   * List parts for a session
   */
  static listBySession(
    db: Database,
    sessionId: string,
    options: {
      type?: PartType;
      toolName?: string;
      limit?: number;
    } = {}
  ): MessagePart[] {
    let query = "SELECT * FROM message_parts WHERE session_id = ?";
    const params: (string | number)[] = [sessionId];

    if (options.type) {
      query += " AND type = ?";
      params.push(options.type);
    }

    if (options.toolName) {
      query += " AND tool_name = ?";
      params.push(options.toolName);
    }

    query += " ORDER BY id ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = db.prepare(query).all(...params) as MessagePartRow[];
    return rows.map(rowToMessagePart);
  }

  /**
   * Update part content (for streaming updates)
   */
  static updateContent(
    db: Database,
    partId: string,
    content: unknown
  ): MessagePart {
    db.prepare(
      `
      UPDATE message_parts SET
        content = ?,
        updated_at = ?
      WHERE id = ?
    `
    ).run(JSON.stringify(content), Date.now(), partId);

    return this.getByIdOrThrow(db, partId);
  }

  /**
   * Append to text content (for streaming text)
   */
  static appendText(db: Database, partId: string, text: string): MessagePart {
    const part = this.getByIdOrThrow(db, partId);
    const content = part.content as { text: string };
    const newContent = { text: (content.text || "") + text };

    return this.updateContent(db, partId, newContent);
  }

  /**
   * Update tool status
   */
  static updateToolStatus(
    db: Database,
    partId: string,
    status: ToolStatus
  ): MessagePart {
    db.prepare(
      `
      UPDATE message_parts SET
        tool_status = ?,
        updated_at = ?
      WHERE id = ?
    `
    ).run(status, Date.now(), partId);

    return this.getByIdOrThrow(db, partId);
  }

  /**
   * Get tool call by tool call ID
   */
  static getByToolCallId(
    db: Database,
    sessionId: string,
    toolCallId: string
  ): MessagePart | null {
    const row = db
      .prepare(
        "SELECT * FROM message_parts WHERE session_id = ? AND tool_call_id = ?"
      )
      .get(sessionId, toolCallId) as MessagePartRow | undefined;

    if (!row) return null;
    return rowToMessagePart(row);
  }

  /**
   * Delete parts by message ID
   */
  static deleteByMessage(db: Database, messageId: string): number {
    const result = db
      .prepare("DELETE FROM message_parts WHERE message_id = ?")
      .run(messageId);
    return result.changes;
  }
}
