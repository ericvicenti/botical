/**
 * Workflow Configuration (YAML-based)
 *
 * Manages workflows stored as YAML files in .botical/workflows/
 * Workflows define composable action sequences that execute as a DAG.
 */

import { z } from "zod";
import * as path from "path";
import {
  loadYamlFileWithSchema,
  loadYamlDir,
  saveYamlFile,
  deleteYamlFile,
  yamlFileExists,
  getBoticalPaths,
} from "./yaml.ts";
import type { ActionCategory } from "@/actions/types.ts";
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowInputSchema,
} from "@/workflows/types.ts";

// ============================================================================
// YAML Schema
// ============================================================================

/**
 * Input field schema for YAML validation
 */
const WorkflowInputFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "enum"]),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  options: z.array(z.string()).optional(),
});

/**
 * Input schema for YAML validation
 */
const WorkflowInputSchemaSchema = z.object({
  fields: z.array(WorkflowInputFieldSchema).default([]),
});

/**
 * Step schema - loosely typed for YAML validation
 * Full validation happens at runtime
 */
const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(["action", "notify", "resolve", "reject", "log", "session"]),
  dependsOn: z.array(z.string()).optional(),
  if: z.unknown().optional(),
  // Action step fields
  action: z.string().optional(),
  args: z.record(z.unknown()).optional(),
  onError: z.object({
    strategy: z.enum(["fail", "continue", "retry"]),
    retryCount: z.number().optional(),
    retryDelay: z.number().optional(),
  }).optional(),
  // Notify step fields
  message: z.unknown().optional(),
  variant: z.enum(["info", "success", "warning", "error"]).optional(),
  // Resolve step fields
  output: z.record(z.unknown()).optional(),
  // Session step fields
  agent: z.unknown().optional(),
  systemPrompt: z.unknown().optional(),
  providerId: z.unknown().optional(),
  modelId: z.unknown().optional(),
  maxMessages: z.unknown().optional(),
});

/**
 * Full workflow YAML schema
 */
export const WorkflowYamlSchema = z.object({
  // name is inferred from filename
  label: z.string(),
  description: z.string().default(""),
  category: z.enum(["file", "search", "shell", "service", "git", "agent", "project", "navigation", "other"]).default("other"),
  icon: z.string().optional(),
  input: WorkflowInputSchemaSchema.default({ fields: [] }),
  steps: z.array(WorkflowStepSchema).default([]),
});

export type WorkflowYaml = z.infer<typeof WorkflowYamlSchema>;

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert YAML workflow to WorkflowDefinition
 * Handles optional fields with defaults
 */
function yamlToWorkflow(name: string, projectId: string, yaml: z.input<typeof WorkflowYamlSchema>): WorkflowDefinition {
  return {
    id: `wf_yaml_${name}`,
    projectId,
    name,
    label: yaml.label,
    description: yaml.description ?? "",
    category: (yaml.category ?? "other") as ActionCategory,
    icon: yaml.icon,
    inputSchema: (yaml.input ?? { fields: [] }) as WorkflowInputSchema,
    steps: (yaml.steps ?? []) as WorkflowStep[],
  };
}

/**
 * Convert WorkflowDefinition to YAML format
 */
function workflowToYaml(workflow: WorkflowDefinition): WorkflowYaml {
  return {
    label: workflow.label,
    description: workflow.description,
    category: workflow.category,
    icon: workflow.icon,
    input: workflow.inputSchema,
    steps: workflow.steps as z.infer<typeof WorkflowStepSchema>[],
  };
}

// ============================================================================
// Workflow YAML Service
// ============================================================================

/**
 * YAML-based Workflow Service
 *
 * Reads and writes workflow definitions from YAML files.
 * Workflows are stored in .botical/workflows/{name}.yaml
 */
export const WorkflowYamlService = {
  /**
   * Get workflow file path
   */
  getPath(projectPath: string, name: string): string {
    return getBoticalPaths(projectPath).workflow(name);
  },

  /**
   * Check if a workflow exists
   */
  exists(projectPath: string, name: string): boolean {
    return yamlFileExists(this.getPath(projectPath, name));
  },

  /**
   * Get workflow by name
   */
  getByName(projectPath: string, projectId: string, name: string): WorkflowDefinition | null {
    const filePath = this.getPath(projectPath, name);
    const yaml = loadYamlFileWithSchema(filePath, WorkflowYamlSchema, { optional: true });
    if (!yaml) return null;
    return yamlToWorkflow(name, projectId, yaml);
  },

  /**
   * List all workflows in a project
   */
  list(projectPath: string, projectId: string): WorkflowDefinition[] {
    const workflowsDir = getBoticalPaths(projectPath).workflows;
    const yamlFiles = loadYamlDir<unknown>(workflowsDir);

    const workflows: WorkflowDefinition[] = [];
    for (const [name, rawYaml] of yamlFiles) {
      try {
        const yaml = WorkflowYamlSchema.parse(rawYaml);
        workflows.push(yamlToWorkflow(name, projectId, yaml));
      } catch (error) {
        console.error(`Failed to parse workflow ${name}:`, error);
      }
    }

    return workflows.sort((a, b) => a.label.localeCompare(b.label));
  },

  /**
   * Create or update a workflow
   */
  save(projectPath: string, workflow: WorkflowDefinition): void {
    const filePath = this.getPath(projectPath, workflow.name);
    const yaml = workflowToYaml(workflow);
    saveYamlFile(filePath, yaml);
  },

  /**
   * Delete a workflow
   */
  delete(projectPath: string, name: string): boolean {
    const filePath = this.getPath(projectPath, name);
    return deleteYamlFile(filePath);
  },

  /**
   * Count workflows in a project
   */
  count(projectPath: string): number {
    return this.list(projectPath, "").length;
  },
};
