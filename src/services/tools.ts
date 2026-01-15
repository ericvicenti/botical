/**
 * Tool Service
 *
 * Manages custom tools within a project database.
 * Supports code, MCP, and HTTP tool types.
 * See: docs/knowledge-base/02-data-model.md#tools
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError, ConflictError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

/**
 * Tool type enumeration
 */
export type ToolType = "code" | "mcp" | "http";

/**
 * HTTP method enumeration
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Tool entity
 */
export interface Tool {
  id: string;
  name: string;
  description: string;
  type: ToolType;
  code: string | null;
  mcpServer: string | null;
  mcpTool: string | null;
  httpUrl: string | null;
  httpMethod: HttpMethod | null;
  parametersSchema: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Database row type
 */
interface ToolRow {
  id: string;
  name: string;
  description: string;
  type: string;
  code: string | null;
  mcp_server: string | null;
  mcp_tool: string | null;
  http_url: string | null;
  http_method: string | null;
  parameters_schema: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

/**
 * Reserved tool names (built-in tools)
 */
const RESERVED_TOOL_NAMES = [
  "read",
  "write",
  "edit",
  "bash",
  "glob",
  "grep",
  "task",
  "web_search",
  "web_fetch",
] as const;

/**
 * Tool name validation regex: lowercase letters, numbers, hyphens, starting with a letter
 */
const TOOL_NAME_REGEX = /^[a-z][a-z0-9-]*$/;

/**
 * Tool creation input schema
 */
export const ToolCreateSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(TOOL_NAME_REGEX, "Tool name must be lowercase with hyphens, starting with a letter"),
    description: z.string().min(1).max(2000),
    type: z.enum(["code", "mcp", "http"]),
    code: z.string().optional(),
    mcpServer: z.string().url().optional(),
    mcpTool: z.string().optional(),
    httpUrl: z.string().url().optional(),
    httpMethod: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
    parametersSchema: z.record(z.unknown()).optional().default({}),
    enabled: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    // Validate reserved names
    if (RESERVED_TOOL_NAMES.includes(data.name as (typeof RESERVED_TOOL_NAMES)[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tool name '${data.name}' is reserved for built-in tools`,
        path: ["name"],
      });
    }

    // Validate type-specific fields
    if (data.type === "code" && !data.code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Code is required for code tools",
        path: ["code"],
      });
    }

    if (data.type === "mcp") {
      if (!data.mcpServer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCP server URL is required for MCP tools",
          path: ["mcpServer"],
        });
      }
      if (!data.mcpTool) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCP tool name is required for MCP tools",
          path: ["mcpTool"],
        });
      }
    }

    if (data.type === "http") {
      if (!data.httpUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "HTTP URL is required for HTTP tools",
          path: ["httpUrl"],
        });
      }
      if (!data.httpMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "HTTP method is required for HTTP tools",
          path: ["httpMethod"],
        });
      }
    }
  });

export type ToolCreateInput = z.input<typeof ToolCreateSchema>;

/**
 * Tool update input schema
 */
export const ToolUpdateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(TOOL_NAME_REGEX, "Tool name must be lowercase with hyphens, starting with a letter")
    .optional(),
  description: z.string().min(1).max(2000).optional(),
  code: z.string().nullable().optional(),
  mcpServer: z.string().url().nullable().optional(),
  mcpTool: z.string().nullable().optional(),
  httpUrl: z.string().url().nullable().optional(),
  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE"]).nullable().optional(),
  parametersSchema: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export type ToolUpdateInput = z.infer<typeof ToolUpdateSchema>;

/**
 * Tool list options
 */
export interface ToolListOptions {
  type?: ToolType;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Convert database row to tool entity
 */
function rowToTool(row: ToolRow): Tool {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as ToolType,
    code: row.code,
    mcpServer: row.mcp_server,
    mcpTool: row.mcp_tool,
    httpUrl: row.http_url,
    httpMethod: row.http_method as HttpMethod | null,
    parametersSchema: JSON.parse(row.parameters_schema),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Tool Service for managing custom tools
 */
export class ToolService {
  /**
   * Create a new tool
   */
  static create(db: Database, input: ToolCreateInput): Tool {
    const validated = ToolCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.tool, { descending: true });

    // Check for duplicate name
    const existing = db
      .prepare("SELECT id FROM tools WHERE name = ?")
      .get(validated.name) as { id: string } | undefined;

    if (existing) {
      throw new ConflictError(`Tool with name '${validated.name}' already exists`, {
        name: validated.name,
      });
    }

    db.prepare(
      `
      INSERT INTO tools (
        id, name, description, type, code, mcp_server, mcp_tool,
        http_url, http_method, parameters_schema, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      validated.name,
      validated.description,
      validated.type,
      validated.code ?? null,
      validated.mcpServer ?? null,
      validated.mcpTool ?? null,
      validated.httpUrl ?? null,
      validated.httpMethod ?? null,
      JSON.stringify(validated.parametersSchema),
      validated.enabled ? 1 : 0,
      now,
      now
    );

    return {
      id,
      name: validated.name,
      description: validated.description,
      type: validated.type,
      code: validated.code ?? null,
      mcpServer: validated.mcpServer ?? null,
      mcpTool: validated.mcpTool ?? null,
      httpUrl: validated.httpUrl ?? null,
      httpMethod: validated.httpMethod ?? null,
      parametersSchema: validated.parametersSchema,
      enabled: validated.enabled,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get a tool by ID
   */
  static getById(db: Database, toolId: string): Tool | null {
    const row = db.prepare("SELECT * FROM tools WHERE id = ?").get(toolId) as ToolRow | undefined;

    if (!row) return null;
    return rowToTool(row);
  }

  /**
   * Get a tool by ID or throw NotFoundError
   */
  static getByIdOrThrow(db: Database, toolId: string): Tool {
    const tool = this.getById(db, toolId);
    if (!tool) {
      throw new NotFoundError("Tool", toolId);
    }
    return tool;
  }

  /**
   * Get a tool by name
   */
  static getByName(db: Database, name: string): Tool | null {
    const row = db.prepare("SELECT * FROM tools WHERE name = ?").get(name) as ToolRow | undefined;

    if (!row) return null;
    return rowToTool(row);
  }

  /**
   * Get a tool by name or throw NotFoundError
   */
  static getByNameOrThrow(db: Database, name: string): Tool {
    const tool = this.getByName(db, name);
    if (!tool) {
      throw new NotFoundError("Tool", name);
    }
    return tool;
  }

  /**
   * List tools with optional filtering
   */
  static list(db: Database, options: ToolListOptions = {}): Tool[] {
    let query = "SELECT * FROM tools WHERE 1=1";
    const params: (string | number)[] = [];

    if (options.type) {
      query += " AND type = ?";
      params.push(options.type);
    }

    if (options.enabled !== undefined) {
      query += " AND enabled = ?";
      params.push(options.enabled ? 1 : 0);
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

    const rows = db.prepare(query).all(...params) as ToolRow[];
    return rows.map(rowToTool);
  }

  /**
   * Update a tool
   */
  static update(db: Database, toolId: string, input: ToolUpdateInput): Tool {
    const tool = this.getByIdOrThrow(db, toolId);
    const validated = ToolUpdateSchema.parse(input);
    const now = Date.now();

    // Check for reserved name if name is being updated
    if (
      validated.name &&
      RESERVED_TOOL_NAMES.includes(validated.name as (typeof RESERVED_TOOL_NAMES)[number])
    ) {
      throw new ValidationError(`Tool name '${validated.name}' is reserved for built-in tools`);
    }

    // Check for duplicate name if name is being updated
    if (validated.name && validated.name !== tool.name) {
      const existing = db
        .prepare("SELECT id FROM tools WHERE name = ?")
        .get(validated.name) as { id: string } | undefined;

      if (existing) {
        throw new ConflictError(`Tool with name '${validated.name}' already exists`, {
          name: validated.name,
        });
      }
    }

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];

    if (validated.name !== undefined) {
      updates.push("name = ?");
      params.push(validated.name);
    }

    if (validated.description !== undefined) {
      updates.push("description = ?");
      params.push(validated.description);
    }

    if (validated.code !== undefined) {
      updates.push("code = ?");
      params.push(validated.code);
    }

    if (validated.mcpServer !== undefined) {
      updates.push("mcp_server = ?");
      params.push(validated.mcpServer);
    }

    if (validated.mcpTool !== undefined) {
      updates.push("mcp_tool = ?");
      params.push(validated.mcpTool);
    }

    if (validated.httpUrl !== undefined) {
      updates.push("http_url = ?");
      params.push(validated.httpUrl);
    }

    if (validated.httpMethod !== undefined) {
      updates.push("http_method = ?");
      params.push(validated.httpMethod);
    }

    if (validated.parametersSchema !== undefined) {
      updates.push("parameters_schema = ?");
      params.push(JSON.stringify(validated.parametersSchema));
    }

    if (validated.enabled !== undefined) {
      updates.push("enabled = ?");
      params.push(validated.enabled ? 1 : 0);
    }

    params.push(toolId);

    db.prepare(`UPDATE tools SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    return this.getByIdOrThrow(db, toolId);
  }

  /**
   * Delete a tool (soft delete - set enabled=0)
   */
  static delete(db: Database, toolId: string): void {
    this.getByIdOrThrow(db, toolId);
    const now = Date.now();

    db.prepare("UPDATE tools SET enabled = 0, updated_at = ? WHERE id = ?").run(now, toolId);
  }

  /**
   * Hard delete a tool (permanent removal)
   */
  static hardDelete(db: Database, toolId: string): void {
    this.getByIdOrThrow(db, toolId);

    db.prepare("DELETE FROM tools WHERE id = ?").run(toolId);
  }

  /**
   * Count tools with optional filters
   */
  static count(db: Database, options: { type?: ToolType; enabled?: boolean } = {}): number {
    let query = "SELECT COUNT(*) as count FROM tools WHERE 1=1";
    const params: (string | number)[] = [];

    if (options.type) {
      query += " AND type = ?";
      params.push(options.type);
    }

    if (options.enabled !== undefined) {
      query += " AND enabled = ?";
      params.push(options.enabled ? 1 : 0);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Check if a tool name is reserved
   */
  static isReservedName(name: string): boolean {
    return RESERVED_TOOL_NAMES.includes(name as (typeof RESERVED_TOOL_NAMES)[number]);
  }

  /**
   * Get list of reserved tool names
   */
  static getReservedNames(): readonly string[] {
    return RESERVED_TOOL_NAMES;
  }
}
