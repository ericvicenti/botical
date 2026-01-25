/**
 * Unified Workflow Service
 *
 * Combines workflows from multiple sources:
 * 1. YAML files in .iris/workflows/ (primary, file-based)
 * 2. SQLite database (legacy, for backward compatibility)
 *
 * YAML workflows take precedence if there's a name conflict.
 */

import type { Database } from "bun:sqlite";
import type { WorkflowDefinition } from "@/workflows/types.ts";
import { WorkflowService, type WorkflowCreate, type WorkflowUpdate } from "./workflows.ts";
import { WorkflowYamlService } from "@/config/workflows.ts";
import { ProjectService } from "./projects.ts";
import { DatabaseManager } from "@/database/index.ts";
import { NotFoundError, ValidationError, ConflictError } from "@/utils/errors.ts";

/**
 * Source indicator for workflows
 */
export type WorkflowSource = "yaml" | "database";

/**
 * Extended workflow with source info
 */
export interface WorkflowWithSource extends WorkflowDefinition {
  source: WorkflowSource;
}

/**
 * Unified Workflow Service
 */
export const UnifiedWorkflowService = {
  /**
   * Get project path from project ID
   */
  getProjectPath(projectId: string): string {
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.getById(rootDb, projectId);
    if (!project) {
      throw new NotFoundError("Project", projectId);
    }
    if (!project.path) {
      throw new ValidationError("Project has no path configured");
    }
    return project.path;
  },

  /**
   * List all workflows from all sources
   */
  list(
    db: Database,
    projectId: string,
    projectPath: string,
    options: {
      category?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): WorkflowWithSource[] {
    const { category, limit = 50, offset = 0 } = options;

    // Get YAML workflows
    const yamlWorkflows = WorkflowYamlService.list(projectPath, projectId)
      .map(w => ({ ...w, source: "yaml" as WorkflowSource }));

    // Get database workflows
    const dbWorkflows = WorkflowService.list(db, projectId, { category })
      .map(w => ({ ...w, source: "database" as WorkflowSource }));

    // Merge: YAML takes precedence over database for same name
    const yamlNames = new Set(yamlWorkflows.map(w => w.name));
    const combined = [
      ...yamlWorkflows,
      ...dbWorkflows.filter(w => !yamlNames.has(w.name)),
    ];

    // Apply category filter to YAML workflows (DB already filtered)
    let filtered = combined;
    if (category) {
      filtered = combined.filter(w => w.category === category);
    }

    // Sort and paginate
    filtered.sort((a, b) => a.label.localeCompare(b.label));
    return filtered.slice(offset, offset + limit);
  },

  /**
   * Count all workflows from all sources
   */
  count(
    db: Database,
    projectId: string,
    projectPath: string,
    options: { category?: string } = {}
  ): number {
    // For accurate count, we need to load all and filter
    const all = this.list(db, projectId, projectPath, {
      category: options.category,
      limit: 10000,
      offset: 0,
    });
    return all.length;
  },

  /**
   * Get workflow by ID
   */
  getById(
    db: Database,
    projectId: string,
    projectPath: string,
    workflowId: string
  ): WorkflowWithSource | null {
    // Check if it's a YAML workflow ID
    if (workflowId.startsWith("wf_yaml_")) {
      const name = workflowId.replace("wf_yaml_", "");
      const workflow = WorkflowYamlService.getByName(projectPath, projectId, name);
      if (workflow) {
        return { ...workflow, source: "yaml" };
      }
    }

    // Check database
    const workflow = WorkflowService.getById(db, workflowId);
    if (workflow) {
      return { ...workflow, source: "database" };
    }

    return null;
  },

  /**
   * Get workflow by ID or throw
   */
  getByIdOrThrow(
    db: Database,
    projectId: string,
    projectPath: string,
    workflowId: string
  ): WorkflowWithSource {
    const workflow = this.getById(db, projectId, projectPath, workflowId);
    if (!workflow) {
      throw new NotFoundError("Workflow", workflowId);
    }
    return workflow;
  },

  /**
   * Get workflow by name
   */
  getByName(
    db: Database,
    projectId: string,
    projectPath: string,
    name: string
  ): WorkflowWithSource | null {
    // YAML takes precedence
    const yamlWorkflow = WorkflowYamlService.getByName(projectPath, projectId, name);
    if (yamlWorkflow) {
      return { ...yamlWorkflow, source: "yaml" };
    }

    // Check database
    const dbWorkflow = WorkflowService.getByName(db, projectId, name);
    if (dbWorkflow) {
      return { ...dbWorkflow, source: "database" };
    }

    return null;
  },

  /**
   * Create a workflow
   * - If saveToYaml is true, saves to YAML file
   * - Otherwise saves to database (legacy behavior)
   */
  create(
    db: Database,
    projectId: string,
    projectPath: string,
    input: WorkflowCreate,
    saveToYaml: boolean = false
  ): WorkflowWithSource {
    // Check for existing workflow with same name
    const existing = this.getByName(db, projectId, projectPath, input.name);
    if (existing) {
      throw new ConflictError(`Workflow with name "${input.name}" already exists`, {
        workflowName: input.name,
      });
    }

    if (saveToYaml) {
      // Create YAML workflow
      const workflow: WorkflowDefinition = {
        id: `wf_yaml_${input.name}`,
        projectId,
        name: input.name,
        label: input.label,
        description: input.description ?? "",
        category: input.category ?? "other",
        icon: input.icon,
        inputSchema: input.inputSchema ?? { fields: [] },
        steps: (input.steps ?? []) as WorkflowDefinition["steps"],
      };
      WorkflowYamlService.save(projectPath, workflow);
      return { ...workflow, source: "yaml" };
    } else {
      // Create database workflow
      const workflow = WorkflowService.create(db, projectId, input);
      return { ...workflow, source: "database" };
    }
  },

  /**
   * Update a workflow
   * - YAML workflows are updated by saving the file
   * - Database workflows use the standard service
   */
  update(
    db: Database,
    projectId: string,
    projectPath: string,
    workflowId: string,
    input: WorkflowUpdate
  ): WorkflowWithSource {
    const existing = this.getByIdOrThrow(db, projectId, projectPath, workflowId);

    if (existing.source === "yaml") {
      // Update YAML workflow
      const updated: WorkflowDefinition = {
        ...existing,
        name: input.name ?? existing.name,
        label: input.label ?? existing.label,
        description: input.description ?? existing.description,
        category: input.category ?? existing.category,
        icon: input.icon !== undefined ? input.icon ?? undefined : existing.icon,
        inputSchema: input.inputSchema ?? existing.inputSchema,
        steps: (input.steps ?? existing.steps) as WorkflowDefinition["steps"],
      };

      // If name changed, delete old file and create new
      if (input.name && input.name !== existing.name) {
        WorkflowYamlService.delete(projectPath, existing.name);
        updated.id = `wf_yaml_${input.name}`;
      }

      WorkflowYamlService.save(projectPath, updated);
      return { ...updated, source: "yaml" };
    } else {
      // Update database workflow
      const workflow = WorkflowService.update(db, workflowId, input);
      return { ...workflow, source: "database" };
    }
  },

  /**
   * Delete a workflow
   */
  delete(
    db: Database,
    projectId: string,
    projectPath: string,
    workflowId: string
  ): void {
    const existing = this.getByIdOrThrow(db, projectId, projectPath, workflowId);

    if (existing.source === "yaml") {
      WorkflowYamlService.delete(projectPath, existing.name);
    } else {
      WorkflowService.delete(db, workflowId);
    }
  },
};
