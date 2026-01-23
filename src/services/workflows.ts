/**
 * Workflow Service
 *
 * Manages workflows within a project database.
 * Handles CRUD operations for user-defined workflows.
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError, ConflictError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";
import type {
  WorkflowDefinition,
  WorkflowRecord,
  WorkflowStep,
  WorkflowInputSchema,
} from "@/workflows/types.ts";
import { recordToWorkflow } from "@/workflows/types.ts";

/**
 * Workflow name validation regex: lowercase letters, numbers, hyphens, starting with a letter
 */
const WORKFLOW_NAME_REGEX = /^[a-z][a-z0-9-]*$/;

/**
 * Workflow creation input schema
 */
export const WorkflowCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(WORKFLOW_NAME_REGEX, "Workflow name must be lowercase with hyphens, starting with a letter"),
  label: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  category: z.enum(["file", "search", "shell", "service", "git", "agent", "project", "navigation", "other"]).default("other"),
  icon: z.string().max(50).optional(),
  inputSchema: z.object({
    fields: z.array(z.object({
      name: z.string(),
      type: z.enum(["string", "number", "boolean", "enum"]),
      label: z.string(),
      description: z.string().optional(),
      required: z.boolean().optional(),
      default: z.unknown().optional(),
      options: z.array(z.string()).optional(),
    })),
  }).default({ fields: [] }),
  steps: z.array(z.unknown()).default([]),
});

export type WorkflowCreate = z.infer<typeof WorkflowCreateSchema>;

/**
 * Workflow update input schema
 */
export const WorkflowUpdateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(WORKFLOW_NAME_REGEX, "Workflow name must be lowercase with hyphens, starting with a letter")
    .optional(),
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.enum(["file", "search", "shell", "service", "git", "agent", "project", "navigation", "other"]).optional(),
  icon: z.string().max(50).nullable().optional(),
  inputSchema: z.object({
    fields: z.array(z.object({
      name: z.string(),
      type: z.enum(["string", "number", "boolean", "enum"]),
      label: z.string(),
      description: z.string().optional(),
      required: z.boolean().optional(),
      default: z.unknown().optional(),
      options: z.array(z.string()).optional(),
    })),
  }).optional(),
  steps: z.array(z.unknown()).optional(),
});

export type WorkflowUpdate = z.infer<typeof WorkflowUpdateSchema>;

/**
 * Convert database row to WorkflowDefinition
 */
function rowToWorkflow(row: WorkflowRecord): WorkflowDefinition {
  return recordToWorkflow(row);
}

/**
 * Workflow Service
 */
export const WorkflowService = {
  /**
   * Create a new workflow
   */
  create(db: Database, projectId: string, input: WorkflowCreate): WorkflowDefinition {
    const now = Date.now();
    const id = generateId(IdPrefixes.workflow);

    // Check for duplicate name
    const existing = db.query<{ id: string }, [string, string]>(
      "SELECT id FROM workflows WHERE project_id = ? AND name = ?"
    ).get(projectId, input.name);

    if (existing) {
      throw new ConflictError(`Workflow with name "${input.name}" already exists`);
    }

    // Apply defaults for optional fields
    const description = input.description ?? "";
    const category = input.category ?? "other";
    const inputSchema = input.inputSchema ?? { fields: [] };
    const steps = input.steps ?? [];

    db.query(`
      INSERT INTO workflows (
        id, project_id, name, label, description, category, icon,
        input_schema, steps, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      input.name,
      input.label,
      description,
      category,
      input.icon || null,
      JSON.stringify(inputSchema),
      JSON.stringify(steps),
      now,
      now
    );

    return this.getById(db, id)!;
  },

  /**
   * Get workflow by ID
   */
  getById(db: Database, id: string): WorkflowDefinition | null {
    const row = db.query<WorkflowRecord, [string]>(
      "SELECT * FROM workflows WHERE id = ?"
    ).get(id);

    return row ? rowToWorkflow(row) : null;
  },

  /**
   * Get workflow by ID or throw
   */
  getByIdOrThrow(db: Database, id: string): WorkflowDefinition {
    const workflow = this.getById(db, id);
    if (!workflow) {
      throw new NotFoundError("Workflow", id);
    }
    return workflow;
  },

  /**
   * Get workflow by name within project
   */
  getByName(db: Database, projectId: string, name: string): WorkflowDefinition | null {
    const row = db.query<WorkflowRecord, [string, string]>(
      "SELECT * FROM workflows WHERE project_id = ? AND name = ?"
    ).get(projectId, name);

    return row ? rowToWorkflow(row) : null;
  },

  /**
   * List workflows for a project
   */
  list(
    db: Database,
    projectId: string,
    options: {
      category?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): WorkflowDefinition[] {
    const { category, limit = 50, offset = 0 } = options;

    let query = "SELECT * FROM workflows WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    query += " ORDER BY label ASC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = db.query<WorkflowRecord, (string | number)[]>(query).all(...params);
    return rows.map(rowToWorkflow);
  },

  /**
   * Count workflows for a project
   */
  count(
    db: Database,
    projectId: string,
    options: { category?: string } = {}
  ): number {
    const { category } = options;

    let query = "SELECT COUNT(*) as count FROM workflows WHERE project_id = ?";
    const params: string[] = [projectId];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    const result = db.query<{ count: number }, string[]>(query).get(...params);
    return result?.count ?? 0;
  },

  /**
   * Update a workflow
   */
  update(db: Database, id: string, input: WorkflowUpdate): WorkflowDefinition {
    const existing = this.getByIdOrThrow(db, id);
    const now = Date.now();

    // Check for duplicate name if name is being changed
    if (input.name && input.name !== existing.name) {
      const row = db.query<WorkflowRecord, [string]>(
        "SELECT project_id FROM workflows WHERE id = ?"
      ).get(id);

      if (row) {
        const duplicate = db.query<{ id: string }, [string, string]>(
          "SELECT id FROM workflows WHERE project_id = ? AND name = ?"
        ).get(row.project_id, input.name);

        if (duplicate) {
          throw new ConflictError(`Workflow with name "${input.name}" already exists`);
        }
      }
    }

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];

    if (input.name !== undefined) {
      updates.push("name = ?");
      params.push(input.name);
    }
    if (input.label !== undefined) {
      updates.push("label = ?");
      params.push(input.label);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      params.push(input.description);
    }
    if (input.category !== undefined) {
      updates.push("category = ?");
      params.push(input.category);
    }
    if (input.icon !== undefined) {
      updates.push("icon = ?");
      params.push(input.icon);
    }
    if (input.inputSchema !== undefined) {
      updates.push("input_schema = ?");
      params.push(JSON.stringify(input.inputSchema));
    }
    if (input.steps !== undefined) {
      updates.push("steps = ?");
      params.push(JSON.stringify(input.steps));
    }

    params.push(id);

    db.query(`UPDATE workflows SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    return this.getByIdOrThrow(db, id);
  },

  /**
   * Delete a workflow
   */
  delete(db: Database, id: string): void {
    const result = db.query("DELETE FROM workflows WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new NotFoundError("Workflow", id);
    }
  },
};
