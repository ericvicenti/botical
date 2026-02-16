/**
 * Memory Blocks Service
 *
 * Implements Letta-style memory blocks for persistent agent state.
 * Memory blocks are structured, persistent data that agents can read/write
 * across sessions to maintain context and working memory.
 *
 * Key features:
 * - Persistent across sessions (survives conversation restarts)
 * - Structured data with schemas and validation
 * - Agent-scoped (each agent has its own memory blocks)
 * - Session-accessible (agents can read/write during conversations)
 * - Versioned (track changes over time)
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

/**
 * Memory block types define the structure and purpose of different memory blocks
 */
export type MemoryBlockType = 
  | "scratchpad"     // Working notes and temporary thoughts
  | "task_context"   // Current task understanding and progress
  | "learned_facts"  // Persistent knowledge learned from interactions
  | "preferences"    // User preferences and patterns
  | "project_state"  // Project-specific context and status
  | "custom";        // User-defined custom blocks

/**
 * Memory block creation input schema
 */
export const MemoryBlockCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["scratchpad", "task_context", "learned_facts", "preferences", "project_state", "custom"]),
  description: z.string().max(500).optional(),
  content: z.string().max(10000),
  schema: z.string().optional(), // JSON schema for structured content validation
  agentName: z.string().min(1).max(100),
  sessionId: z.string().optional(), // Optional session context
});

export type MemoryBlockCreateInput = z.infer<typeof MemoryBlockCreateSchema>;

/**
 * Memory block update input schema
 */
export const MemoryBlockUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  content: z.string().max(10000).optional(),
  schema: z.string().optional(),
});

export type MemoryBlockUpdateInput = z.infer<typeof MemoryBlockUpdateSchema>;

/**
 * Memory block entity
 */
export interface MemoryBlock {
  id: string;
  name: string;
  type: MemoryBlockType;
  description: string | null;
  content: string;
  schema: string | null;
  agentName: string;
  sessionId: string | null;
  version: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Memory block version for history tracking
 */
export interface MemoryBlockVersion {
  id: string;
  blockId: string;
  version: number;
  content: string;
  changeReason: string | null;
  sessionId: string | null;
  createdAt: number;
}

/**
 * Database row types
 */
interface MemoryBlockRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  content: string;
  schema: string | null;
  agent_name: string;
  session_id: string | null;
  version: number;
  created_at: number;
  updated_at: number;
}

interface MemoryBlockVersionRow {
  id: string;
  block_id: string;
  version: number;
  content: string;
  change_reason: string | null;
  session_id: string | null;
  created_at: number;
}

/**
 * Convert database row to memory block entity
 */
function rowToMemoryBlock(row: MemoryBlockRow): MemoryBlock {
  return {
    id: row.id,
    name: row.name,
    type: row.type as MemoryBlockType,
    description: row.description,
    content: row.content,
    schema: row.schema,
    agentName: row.agent_name,
    sessionId: row.session_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert database row to memory block version entity
 */
function rowToMemoryBlockVersion(row: MemoryBlockVersionRow): MemoryBlockVersion {
  return {
    id: row.id,
    blockId: row.block_id,
    version: row.version,
    content: row.content,
    changeReason: row.change_reason,
    sessionId: row.session_id,
    createdAt: row.created_at,
  };
}

/**
 * Memory Blocks Service
 */
export class MemoryBlockService {
  /**
   * Create a new memory block
   */
  static create(db: Database, input: MemoryBlockCreateInput): MemoryBlock {
    const validated = MemoryBlockCreateSchema.parse(input);
    const id = generateId(IdPrefixes.memoryBlock);
    const now = Date.now();

    // Validate JSON schema if provided
    if (validated.schema) {
      try {
        JSON.parse(validated.schema);
      } catch (error) {
        throw new Error(`Invalid JSON schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Insert memory block
    const stmt = db.prepare(`
      INSERT INTO memory_blocks (
        id, name, type, description, content, schema, agent_name, session_id, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    stmt.run(
      id,
      validated.name,
      validated.type,
      validated.description || null,
      validated.content,
      validated.schema || null,
      validated.agentName,
      validated.sessionId || null,
      now,
      now
    );

    // Create initial version record
    this.createVersion(db, id, 1, validated.content, "Initial creation", validated.sessionId);

    return this.getById(db, id);
  }

  /**
   * Get memory block by ID
   */
  static getById(db: Database, id: string): MemoryBlock {
    const stmt = db.prepare("SELECT * FROM memory_blocks WHERE id = ?");
    const row = stmt.get(id) as MemoryBlockRow | undefined;

    if (!row) {
      throw new NotFoundError(`Memory block not found: ${id}`);
    }

    return rowToMemoryBlock(row);
  }

  /**
   * Get memory blocks by agent name
   */
  static getByAgent(db: Database, agentName: string): MemoryBlock[] {
    const stmt = db.prepare(`
      SELECT * FROM memory_blocks 
      WHERE agent_name = ? 
      ORDER BY type, name
    `);
    const rows = stmt.all(agentName) as MemoryBlockRow[];
    return rows.map(rowToMemoryBlock);
  }

  /**
   * Get memory blocks by agent and type
   */
  static getByAgentAndType(db: Database, agentName: string, type: MemoryBlockType): MemoryBlock[] {
    const stmt = db.prepare(`
      SELECT * FROM memory_blocks 
      WHERE agent_name = ? AND type = ?
      ORDER BY name
    `);
    const rows = stmt.all(agentName, type) as MemoryBlockRow[];
    return rows.map(rowToMemoryBlock);
  }

  /**
   * Get memory block by agent and name (unique constraint)
   */
  static getByAgentAndName(db: Database, agentName: string, name: string): MemoryBlock | null {
    const stmt = db.prepare(`
      SELECT * FROM memory_blocks 
      WHERE agent_name = ? AND name = ?
    `);
    const row = stmt.get(agentName, name) as MemoryBlockRow | undefined;
    return row ? rowToMemoryBlock(row) : null;
  }

  /**
   * Update memory block content and increment version
   */
  static update(db: Database, id: string, input: MemoryBlockUpdateInput, sessionId?: string, changeReason?: string): MemoryBlock {
    const validated = MemoryBlockUpdateSchema.parse(input);
    const existing = this.getById(db, id);

    // Validate JSON schema if provided
    if (validated.schema) {
      try {
        JSON.parse(validated.schema);
      } catch (error) {
        throw new Error(`Invalid JSON schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const now = Date.now();
    const newVersion = existing.version + 1;

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (validated.name !== undefined) {
      updates.push("name = ?");
      values.push(validated.name);
    }
    if (validated.description !== undefined) {
      updates.push("description = ?");
      values.push(validated.description);
    }
    if (validated.content !== undefined) {
      updates.push("content = ?");
      values.push(validated.content);
    }
    if (validated.schema !== undefined) {
      updates.push("schema = ?");
      values.push(validated.schema);
    }

    // Always update version and timestamp
    updates.push("version = ?", "updated_at = ?");
    values.push(newVersion, now);

    // Add WHERE clause
    values.push(id);

    const stmt = db.prepare(`
      UPDATE memory_blocks 
      SET ${updates.join(", ")}
      WHERE id = ?
    `);

    stmt.run(...values);

    // Create version record if content changed
    if (validated.content !== undefined) {
      this.createVersion(db, id, newVersion, validated.content, changeReason || "Content updated", sessionId);
    }

    return this.getById(db, id);
  }

  /**
   * Delete memory block
   */
  static delete(db: Database, id: string): void {
    const stmt = db.prepare("DELETE FROM memory_blocks WHERE id = ?");
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new NotFoundError(`Memory block not found: ${id}`);
    }

    // Delete version history
    const versionStmt = db.prepare("DELETE FROM memory_block_versions WHERE block_id = ?");
    versionStmt.run(id);
  }

  /**
   * Get version history for a memory block
   */
  static getVersions(db: Database, blockId: string): MemoryBlockVersion[] {
    const stmt = db.prepare(`
      SELECT * FROM memory_block_versions 
      WHERE block_id = ? 
      ORDER BY version DESC
    `);
    const rows = stmt.all(blockId) as MemoryBlockVersionRow[];
    return rows.map(rowToMemoryBlockVersion);
  }

  /**
   * Get specific version of a memory block
   */
  static getVersion(db: Database, blockId: string, version: number): MemoryBlockVersion | null {
    const stmt = db.prepare(`
      SELECT * FROM memory_block_versions 
      WHERE block_id = ? AND version = ?
    `);
    const row = stmt.get(blockId, version) as MemoryBlockVersionRow | undefined;
    return row ? rowToMemoryBlockVersion(row) : null;
  }

  /**
   * Create a version record
   */
  private static createVersion(db: Database, blockId: string, version: number, content: string, changeReason?: string, sessionId?: string): void {
    const versionId = generateId(IdPrefixes.memoryBlockVersion);
    const stmt = db.prepare(`
      INSERT INTO memory_block_versions (
        id, block_id, version, content, change_reason, session_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      versionId,
      blockId,
      version,
      content,
      changeReason || null,
      sessionId || null,
      Date.now()
    );
  }

  /**
   * Get memory blocks summary for agent context
   * Returns a formatted string suitable for including in agent system prompts
   */
  static getAgentContextSummary(db: Database, agentName: string): string {
    const blocks = this.getByAgent(db, agentName);
    
    if (blocks.length === 0) {
      return "No memory blocks available.";
    }

    const sections: string[] = [];
    
    // Group by type
    const blocksByType = blocks.reduce((acc, block) => {
      if (!acc[block.type]) acc[block.type] = [];
      acc[block.type].push(block);
      return acc;
    }, {} as Record<MemoryBlockType, MemoryBlock[]>);

    // Format each type
    for (const [type, typeBlocks] of Object.entries(blocksByType)) {
      const typeTitle = type.replace(/_/g, ' ').toUpperCase();
      sections.push(`## ${typeTitle}`);
      
      for (const block of typeBlocks) {
        sections.push(`### ${block.name}`);
        if (block.description) {
          sections.push(`*${block.description}*`);
        }
        sections.push(block.content);
        sections.push(''); // Empty line for spacing
      }
    }

    return sections.join('\n');
  }

  /**
   * Initialize default memory blocks for a new agent
   */
  static initializeAgentMemory(db: Database, agentName: string): void {
    // Create default scratchpad
    const scratchpadExists = this.getByAgentAndName(db, agentName, "scratchpad");
    if (!scratchpadExists) {
      this.create(db, {
        name: "scratchpad",
        type: "scratchpad",
        description: "Working notes and temporary thoughts",
        content: "# Working Notes\n\n*This is your scratchpad for temporary thoughts and notes.*",
        agentName,
      });
    }

    // Create default task context
    const taskContextExists = this.getByAgentAndName(db, agentName, "current_task");
    if (!taskContextExists) {
      this.create(db, {
        name: "current_task",
        type: "task_context",
        description: "Current task understanding and progress",
        content: "# Current Task\n\n*No active task*",
        agentName,
      });
    }
  }
}