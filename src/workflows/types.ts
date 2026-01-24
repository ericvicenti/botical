/**
 * Workflow Types
 *
 * Type definitions for the workflow system.
 * Workflows are composable sequences of actions that execute as a DAG.
 */

import { z } from "zod";
import type { ActionCategory } from "@/actions/types.ts";

// ============================================================================
// Argument Bindings
// ============================================================================

/**
 * Literal value binding - hardcoded value
 */
export interface LiteralBinding {
  type: "literal";
  value: unknown;
}

/**
 * Input binding - value from workflow input
 */
export interface InputBinding {
  type: "input";
  path: string; // dot-notation path into workflow input
}

/**
 * Step binding - value from previous step output
 */
export interface StepBinding {
  type: "step";
  stepId: string;
  path: string; // dot-notation path into step output
}

/**
 * Union of all binding types
 */
export type ArgBinding = LiteralBinding | InputBinding | StepBinding;

// ============================================================================
// Conditional Expressions
// ============================================================================

export interface EqualsCondition {
  op: "equals";
  left: ArgBinding;
  right: ArgBinding;
}

export interface NotEqualsCondition {
  op: "notEquals";
  left: ArgBinding;
  right: ArgBinding;
}

export interface ContainsCondition {
  op: "contains";
  value: ArgBinding;
  search: ArgBinding;
}

export interface ExistsCondition {
  op: "exists";
  value: ArgBinding;
}

export interface TruthyCondition {
  op: "truthy";
  value: ArgBinding;
}

export interface AndCondition {
  op: "and";
  conditions: ConditionExpression[];
}

export interface OrCondition {
  op: "or";
  conditions: ConditionExpression[];
}

export interface NotCondition {
  op: "not";
  condition: ConditionExpression;
}

export type ConditionExpression =
  | EqualsCondition
  | NotEqualsCondition
  | ContainsCondition
  | ExistsCondition
  | TruthyCondition
  | AndCondition
  | OrCondition
  | NotCondition;

// ============================================================================
// Error Handling
// ============================================================================

export interface ErrorHandling {
  strategy: "fail" | "continue" | "retry";
  retryCount?: number;
  retryDelay?: number; // ms between retries
}

// ============================================================================
// Step Types
// ============================================================================

/**
 * Base step properties shared by all step types
 */
interface BaseStep {
  id: string;
  dependsOn?: string[];
  if?: ConditionExpression;
}

/**
 * Action step - invokes an action
 */
export interface ActionStep extends BaseStep {
  type: "action";
  action: string; // Action ID to invoke
  args: Record<string, ArgBinding>;
  onError?: ErrorHandling;
}

/**
 * Notify step - show user feedback
 */
export interface NotifyStep extends BaseStep {
  type: "notify";
  message: ArgBinding;
  variant?: "info" | "success" | "warning" | "error";
}

/**
 * Resolve step - complete workflow successfully with output
 */
export interface ResolveStep extends BaseStep {
  type: "resolve";
  output?: Record<string, ArgBinding>;
}

/**
 * Reject step - fail workflow with error
 */
export interface RejectStep extends BaseStep {
  type: "reject";
  message: ArgBinding;
}

/**
 * Log step - log to workflow output
 */
export interface LogStep extends BaseStep {
  type: "log";
  message: ArgBinding;
}

/**
 * Union of all step types
 */
export type WorkflowStep =
  | ActionStep
  | NotifyStep
  | ResolveStep
  | RejectStep
  | LogStep;

// ============================================================================
// Workflow Definition
// ============================================================================

/**
 * Full workflow definition
 */
export interface WorkflowDefinition {
  // Identity
  id: string; // UUID
  projectId: string; // Project this workflow belongs to
  name: string; // Unique name within project (e.g., "deploy-staging")
  label: string; // Human-readable label
  description: string;

  // Categorization
  category: ActionCategory;
  icon?: string; // Lucide icon name

  // Input schema (stored as JSON, parsed to Zod at runtime)
  inputSchema: WorkflowInputSchema;

  // Steps
  steps: WorkflowStep[];
}

/**
 * Input schema field definition (JSON-serializable)
 */
export interface WorkflowInputField {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[]; // For enum type
}

/**
 * Input schema definition (JSON-serializable)
 */
export interface WorkflowInputSchema {
  fields: WorkflowInputField[];
}

/**
 * Convert WorkflowInputSchema to Zod schema
 */
export function inputSchemaToZod(schema: WorkflowInputSchema): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of schema.fields) {
    let fieldSchema: z.ZodTypeAny;

    switch (field.type) {
      case "string":
        fieldSchema = z.string();
        break;
      case "number":
        fieldSchema = z.number();
        break;
      case "boolean":
        fieldSchema = z.boolean();
        break;
      case "enum":
        if (field.options && field.options.length > 0) {
          fieldSchema = z.enum(field.options as [string, ...string[]]);
        } else {
          fieldSchema = z.string();
        }
        break;
      default:
        fieldSchema = z.unknown();
    }

    if (field.description) {
      fieldSchema = fieldSchema.describe(field.description);
    }

    if (!field.required) {
      fieldSchema = fieldSchema.optional();
    }

    if (field.default !== undefined) {
      fieldSchema = fieldSchema.default(field.default);
    }

    shape[field.name] = fieldSchema;
  }

  return z.object(shape);
}

// ============================================================================
// Database Model
// ============================================================================

/**
 * Workflow as stored in database
 */
export interface WorkflowRecord {
  id: string;
  project_id: string;
  name: string;
  label: string;
  description: string;
  category: string;
  icon: string | null;
  input_schema: string; // JSON
  steps: string; // JSON
  created_at: number;
  updated_at: number;
}

/**
 * Convert database record to WorkflowDefinition
 */
export function recordToWorkflow(record: WorkflowRecord): WorkflowDefinition {
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name,
    label: record.label,
    description: record.description,
    category: record.category as ActionCategory,
    icon: record.icon || undefined,
    inputSchema: JSON.parse(record.input_schema),
    steps: JSON.parse(record.steps),
  };
}

/**
 * Convert WorkflowDefinition to database record fields
 */
export function workflowToRecord(
  workflow: WorkflowDefinition,
  projectId: string
): Omit<WorkflowRecord, "created_at" | "updated_at"> {
  return {
    id: workflow.id,
    project_id: projectId,
    name: workflow.name,
    label: workflow.label,
    description: workflow.description,
    category: workflow.category,
    icon: workflow.icon || null,
    input_schema: JSON.stringify(workflow.inputSchema),
    steps: JSON.stringify(workflow.steps),
  };
}

// ============================================================================
// Execution State
// ============================================================================

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type WorkflowStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
 * Runtime state for a single step
 */
export interface StepExecution {
  stepId: string;
  status: StepStatus;
  resolvedArgs?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Runtime state for workflow execution
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  projectId: string;
  input: Record<string, unknown>;
  status: WorkflowStatus;
  steps: Record<string, StepExecution>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: number;
  completedAt?: number;
}
