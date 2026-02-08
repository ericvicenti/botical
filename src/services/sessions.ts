/**
 * Session Service
 *
 * Manages AI conversation sessions within projects.
 * Sessions store conversation history, agent context, and cost tracking.
 * See: docs/knowledge-base/02-data-model.md#session
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";
import type { SessionStatus } from "@/agents/types.ts";

/**
 * Session creation input schema
 */
export const SessionCreateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  agent: z.string().optional().default("default"),
  parentId: z.string().nullable().optional(),
  providerId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
});

export type SessionCreateInput = z.input<typeof SessionCreateSchema>;

/**
 * Session update input schema
 */
export const SessionUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "archived", "deleted"]).optional(),
  agent: z.string().optional(),
  providerId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
});

export type SessionUpdateInput = z.infer<typeof SessionUpdateSchema>;

/**
 * Session entity
 */
export interface Session {
  id: string;
  slug: string;
  parentId: string | null;
  title: string;
  status: SessionStatus;
  agent: string;
  providerId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  messageCount: number;
  totalCost: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  shareUrl: string | null;
  shareSecret: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

/**
 * Database row type
 */
interface SessionRow {
  id: string;
  slug: string;
  parent_id: string | null;
  title: string;
  status: string;
  agent: string;
  provider_id: string | null;
  model_id: string | null;
  system_prompt: string | null;
  message_count: number;
  total_cost: number;
  total_tokens_input: number;
  total_tokens_output: number;
  share_url: string | null;
  share_secret: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}

/**
 * Convert database row to session entity
 */
function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    slug: row.slug,
    parentId: row.parent_id,
    title: row.title,
    status: row.status as SessionStatus,
    agent: row.agent,
    providerId: row.provider_id,
    modelId: row.model_id,
    systemPrompt: row.system_prompt,
    messageCount: row.message_count,
    totalCost: row.total_cost,
    totalTokensInput: row.total_tokens_input,
    totalTokensOutput: row.total_tokens_output,
    shareUrl: row.share_url,
    shareSecret: row.share_secret,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

/**
 * Generate a URL-friendly slug from title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Session Service for managing conversation sessions
 */
export class SessionService {
  /**
   * Create a new session
   */
  static create(db: Database, input: SessionCreateInput): Session {
    const validated = SessionCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.session, { descending: true });
    const title = validated.title || "New Session";
    const slug = generateSlug(title);

    db.prepare(
      `
      INSERT INTO sessions (
        id, slug, parent_id, title, status, agent, provider_id, model_id, system_prompt,
        message_count, total_cost, total_tokens_input, total_tokens_output,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      slug,
      validated.parentId ?? null,
      title,
      "active",
      validated.agent,
      validated.providerId ?? null,
      validated.modelId ?? null,
      validated.systemPrompt ?? null,
      0,
      0,
      0,
      0,
      now,
      now
    );

    return {
      id,
      slug,
      parentId: validated.parentId ?? null,
      title,
      status: "active",
      agent: validated.agent,
      providerId: validated.providerId ?? null,
      modelId: validated.modelId ?? null,
      systemPrompt: validated.systemPrompt ?? null,
      messageCount: 0,
      totalCost: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      shareUrl: null,
      shareSecret: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
  }

  /**
   * Get a session by ID
   */
  static getById(db: Database, sessionId: string): Session | null {
    const row = db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId) as SessionRow | undefined;

    if (!row) return null;
    return rowToSession(row);
  }

  /**
   * Get a session by ID or throw NotFoundError
   */
  static getByIdOrThrow(db: Database, sessionId: string): Session {
    const session = this.getById(db, sessionId);
    if (!session) {
      throw new NotFoundError("Session", sessionId);
    }
    return session;
  }

  /**
   * List sessions with optional filtering
   */
  static list(
    db: Database,
    options: {
      status?: SessionStatus;
      agent?: string;
      parentId?: string | null;
      limit?: number;
      offset?: number;
    } = {}
  ): Session[] {
    let query = "SELECT * FROM sessions WHERE 1=1";
    const params: (string | number | null)[] = [];

    if (options.status) {
      query += " AND status = ?";
      params.push(options.status);
    }

    if (options.agent) {
      query += " AND agent = ?";
      params.push(options.agent);
    }

    if (options.parentId !== undefined) {
      if (options.parentId === null) {
        query += " AND parent_id IS NULL";
      } else {
        query += " AND parent_id = ?";
        params.push(options.parentId);
      }
    }

    // Order by ID ascending (newest first due to descending ID generation)
    query += " ORDER BY id ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as SessionRow[];
    return rows.map(rowToSession);
  }

  /**
   * Update a session
   */
  static update(
    db: Database,
    sessionId: string,
    input: SessionUpdateInput
  ): Session {
    const existing = this.getByIdOrThrow(db, sessionId);
    const validated = SessionUpdateSchema.parse(input);
    const now = Date.now();

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];

    if (validated.title !== undefined) {
      updates.push("title = ?");
      params.push(validated.title);
      updates.push("slug = ?");
      params.push(generateSlug(validated.title));
    }

    if (validated.status !== undefined) {
      updates.push("status = ?");
      params.push(validated.status);

      if (validated.status === "archived" && !existing.archivedAt) {
        updates.push("archived_at = ?");
        params.push(now);
      }
    }

    if (validated.agent !== undefined) {
      updates.push("agent = ?");
      params.push(validated.agent);
    }

    if (validated.providerId !== undefined) {
      updates.push("provider_id = ?");
      params.push(validated.providerId);
    }

    if (validated.modelId !== undefined) {
      updates.push("model_id = ?");
      params.push(validated.modelId);
    }

    if (validated.systemPrompt !== undefined) {
      updates.push("system_prompt = ?");
      params.push(validated.systemPrompt);
    }

    params.push(sessionId);

    db.prepare(
      `UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`
    ).run(...params);

    return this.getByIdOrThrow(db, sessionId);
  }

  /**
   * Archive a session
   */
  static archive(db: Database, sessionId: string): Session {
    return this.update(db, sessionId, { status: "archived" });
  }

  /**
   * Delete a session (soft delete)
   */
  static delete(db: Database, sessionId: string): void {
    this.getByIdOrThrow(db, sessionId);
    this.update(db, sessionId, { status: "deleted" });
  }

  /**
   * Update session statistics after a message
   */
  static updateStats(
    db: Database,
    sessionId: string,
    stats: {
      messageCount?: number;
      cost?: number;
      tokensInput?: number;
      tokensOutput?: number;
    }
  ): void {
    const updates: string[] = ["updated_at = ?"];
    const params: (number | string)[] = [Date.now()];

    if (stats.messageCount !== undefined) {
      updates.push("message_count = message_count + ?");
      params.push(stats.messageCount);
    }

    if (stats.cost !== undefined) {
      updates.push("total_cost = total_cost + ?");
      params.push(stats.cost);
    }

    if (stats.tokensInput !== undefined) {
      updates.push("total_tokens_input = total_tokens_input + ?");
      params.push(stats.tokensInput);
    }

    if (stats.tokensOutput !== undefined) {
      updates.push("total_tokens_output = total_tokens_output + ?");
      params.push(stats.tokensOutput);
    }

    params.push(sessionId);

    db.prepare(
      `UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`
    ).run(...params);
  }

  /**
   * Get child sessions (sub-agent sessions)
   */
  static getChildren(db: Database, parentId: string): Session[] {
    return this.list(db, { parentId });
  }

  /**
   * Count sessions with optional status filter
   */
  static count(db: Database, status?: SessionStatus): number {
    let query = "SELECT COUNT(*) as count FROM sessions";
    const params: string[] = [];

    if (status) {
      query += " WHERE status = ?";
      params.push(status);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Update the system prompt for a session and create a change event
   */
  static updateSystemPrompt(
    db: Database,
    sessionId: string,
    newSystemPrompt: string | null
  ): Session {
    const existing = this.getByIdOrThrow(db, sessionId);
    const previousSystemPrompt = existing.systemPrompt;

    // Update the session
    const updatedSession = this.update(db, sessionId, {
      systemPrompt: newSystemPrompt,
    });

    // Create a system prompt change event message
    if (previousSystemPrompt !== newSystemPrompt) {
      const { MessageService } = require("./messages.ts");
      const { MessagePartService } = require("./messages.ts");
      const { generateId, IdPrefixes } = require("@/utils/id.ts");

      const eventMessage = MessageService.create(db, {
        sessionId,
        role: "system" as const,
      });

      // Create message part with system prompt change event
      MessagePartService.create(db, {
        messageId: eventMessage.id,
        sessionId,
        type: "text",
        content: {
          text: `System prompt updated`,
          event: {
            type: "system_prompt_change",
            previous: previousSystemPrompt,
            current: newSystemPrompt,
            timestamp: Date.now(),
          },
        },
      });

      // Update session message count
      this.updateStats(db, sessionId, { messageCount: 1 });
    }

    return updatedSession;
  }
}
