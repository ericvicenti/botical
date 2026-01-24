/**
 * Workflow Executor
 *
 * Executes workflows by running steps in DAG order.
 */

import type { Database } from "bun:sqlite";
import type {
  WorkflowDefinition,
  WorkflowStep,
  ArgBinding,
  ConditionExpression,
} from "./types.ts";
import { WorkflowExecutionService } from "@/services/workflow-executions.ts";
import { ActionRegistry } from "@/actions/registry.ts";
import type { ActionContext, ActionResult } from "@/actions/types.ts";
import { ConnectionManager, createEvent } from "@/websocket/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface ExecutorContext {
  db: Database;
  executionId: string;
  workflow: WorkflowDefinition;
  input: Record<string, unknown>;
  stepOutputs: Record<string, unknown>;
  actionContext: ActionContext;
  /** If true, notifications return output instead of broadcasting toasts */
  isAgentContext?: boolean;
}

// ============================================================================
// Binding Resolution
// ============================================================================

/**
 * Get value at a dot-notation path
 */
function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Resolve an argument binding to its actual value
 */
function resolveBinding(
  binding: ArgBinding,
  ctx: ExecutorContext
): unknown {
  switch (binding.type) {
    case "literal":
      return binding.value;
    case "input":
      return getPath(ctx.input, binding.path || "");
    case "step":
      if (!binding.stepId) return undefined;
      const stepOutput = ctx.stepOutputs[binding.stepId];
      return getPath(stepOutput, binding.path || "");
    default:
      return undefined;
  }
}

/**
 * Resolve all argument bindings for a step
 */
function resolveArgs(
  args: Record<string, ArgBinding> | undefined,
  ctx: ExecutorContext
): Record<string, unknown> {
  if (!args) return {};
  const resolved: Record<string, unknown> = {};
  for (const [key, binding] of Object.entries(args)) {
    resolved[key] = resolveBinding(binding, ctx);
  }
  return resolved;
}

// ============================================================================
// Condition Evaluation
// ============================================================================

/**
 * Evaluate a condition expression
 */
function evaluateCondition(
  condition: ConditionExpression,
  ctx: ExecutorContext
): boolean {
  switch (condition.op) {
    case "equals": {
      const left = resolveBinding(condition.left, ctx);
      const right = resolveBinding(condition.right, ctx);
      return left === right;
    }
    case "notEquals": {
      const left = resolveBinding(condition.left, ctx);
      const right = resolveBinding(condition.right, ctx);
      return left !== right;
    }
    case "contains": {
      const value = String(resolveBinding(condition.value, ctx) || "");
      const search = String(resolveBinding(condition.search, ctx) || "");
      return value.includes(search);
    }
    case "exists": {
      const value = resolveBinding(condition.value, ctx);
      return value !== undefined && value !== null;
    }
    case "truthy": {
      const value = resolveBinding(condition.value, ctx);
      return Boolean(value);
    }
    case "and":
      return condition.conditions.every((c) => evaluateCondition(c, ctx));
    case "or":
      return condition.conditions.some((c) => evaluateCondition(c, ctx));
    case "not":
      return !evaluateCondition(condition.condition, ctx);
    default:
      return true;
  }
}

// ============================================================================
// Step Execution
// ============================================================================

/**
 * Execute a single step
 */
async function executeStep(
  step: WorkflowStep,
  ctx: ExecutorContext
): Promise<{ output?: unknown; error?: string; skipped?: boolean }> {
  // Check condition
  if (step.if && !evaluateCondition(step.if, ctx)) {
    return { skipped: true };
  }

  // Mark step as running
  WorkflowExecutionService.updateStep(ctx.db, ctx.executionId, step.id, {
    status: "running",
  });
  broadcastStepUpdate(ctx.executionId, step.id, "running");

  try {
    switch (step.type) {
      case "action": {
        if (!step.action) {
          throw new Error("Action step missing action ID");
        }
        const args = resolveArgs(step.args, ctx);
        WorkflowExecutionService.updateStep(ctx.db, ctx.executionId, step.id, {
          resolvedArgs: args,
        });

        const result = await ActionRegistry.execute(
          step.action,
          args,
          ctx.actionContext
        );

        return handleActionResult(result);
      }

      case "notify": {
        const message = String(resolveBinding(step.message, ctx) || "");
        const variant = step.variant || "info";
        // In agent context, just return the message as output for the agent
        // In user context, broadcast a toast notification
        if (!ctx.isAgentContext) {
          broadcastNotification(message, variant);
        }
        return { output: { notified: true, message, variant } };
      }

      case "log": {
        const message = String(resolveBinding(step.message, ctx) || "");
        console.log(`[Workflow ${ctx.executionId}] ${message}`);
        return { output: { logged: true, message } };
      }

      case "resolve": {
        const output: Record<string, unknown> = {};
        if (step.output) {
          for (const [key, binding] of Object.entries(step.output)) {
            output[key] = resolveBinding(binding, ctx);
          }
        }
        return { output };
      }

      case "reject": {
        const message = String(resolveBinding(step.message, ctx) || "Workflow rejected");
        return { error: message };
      }

      default:
        return { error: `Unknown step type: ${(step as WorkflowStep).type}` };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Handle error based on step's onError config
    if (step.type === "action" && step.onError) {
      switch (step.onError.strategy) {
        case "continue":
          return { output: { error: errorMessage, continued: true } };
        case "retry":
          // For now, just continue - proper retry logic would need more infrastructure
          return { output: { error: errorMessage, retryFailed: true } };
        case "fail":
        default:
          return { error: errorMessage };
      }
    }

    return { error: errorMessage };
  }
}

/**
 * Handle action result and convert to step output/error
 */
function handleActionResult(result: ActionResult): { output?: unknown; error?: string } {
  switch (result.type) {
    case "success":
      return {
        output: {
          title: result.title,
          output: result.output,
          metadata: result.metadata,
        },
      };
    case "error":
      return { error: result.message };
    case "navigate":
      return {
        output: {
          navigated: true,
          pageId: result.pageId,
          params: result.params,
        },
      };
    case "ui":
      return {
        output: {
          uiAction: result.action,
          value: result.value,
          message: result.message,
        },
      };
    default:
      return { error: "Unknown action result type" };
  }
}

// ============================================================================
// DAG Execution
// ============================================================================

/**
 * Build dependency graph and get execution order
 */
function getExecutionOrder(steps: WorkflowStep[]): WorkflowStep[][] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  // Initialize
  for (const step of steps) {
    inDegree.set(step.id, 0);
    dependents.set(step.id, []);
  }

  // Build graph
  for (const step of steps) {
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        if (stepMap.has(depId)) {
          inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
          dependents.get(depId)?.push(step.id);
        }
      }
    }
  }

  // Topological sort into levels (for parallel execution)
  const levels: WorkflowStep[][] = [];
  const remaining = new Set(steps.map((s) => s.id));

  while (remaining.size > 0) {
    // Find all steps with no remaining dependencies
    const level: WorkflowStep[] = [];
    for (const id of remaining) {
      if (inDegree.get(id) === 0) {
        level.push(stepMap.get(id)!);
      }
    }

    if (level.length === 0) {
      throw new Error("Circular dependency in workflow steps");
    }

    levels.push(level);

    // Remove completed steps and update degrees
    for (const step of level) {
      remaining.delete(step.id);
      for (const depId of dependents.get(step.id) || []) {
        inDegree.set(depId, (inDegree.get(depId) || 0) - 1);
      }
    }
  }

  return levels;
}

// ============================================================================
// WebSocket Broadcasting
// ============================================================================

function broadcastExecutionUpdate(
  executionId: string,
  status: string,
  data?: Record<string, unknown>
): void {
  const event = createEvent("workflow.execution", {
    executionId,
    status,
    ...data,
  });
  for (const connectionId of ConnectionManager.getAllIds()) {
    ConnectionManager.send(connectionId, event);
  }
}

function broadcastStepUpdate(
  executionId: string,
  stepId: string,
  status: string,
  data?: Record<string, unknown>
): void {
  const event = createEvent("workflow.step", {
    executionId,
    stepId,
    status,
    ...data,
  });
  for (const connectionId of ConnectionManager.getAllIds()) {
    ConnectionManager.send(connectionId, event);
  }
}

function broadcastNotification(message: string, variant: string): void {
  const event = createEvent("workflow.notify", { message, variant });
  for (const connectionId of ConnectionManager.getAllIds()) {
    ConnectionManager.send(connectionId, event);
  }
}

// ============================================================================
// Main Executor
// ============================================================================

export interface ExecuteWorkflowOptions {
  /** If true, run in agent context (notifications return output instead of toasts) */
  isAgentContext?: boolean;
}

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  db: Database,
  workflow: WorkflowDefinition,
  input: Record<string, unknown>,
  actionContext: ActionContext,
  options: ExecuteWorkflowOptions = {}
): Promise<{ executionId: string }> {
  // Create execution record
  const execution = WorkflowExecutionService.create(
    db,
    workflow.id,
    workflow.projectId,
    input
  );

  // Start execution asynchronously
  runWorkflow(db, execution.id, workflow, input, actionContext, options.isAgentContext).catch((err) => {
    console.error("Workflow execution failed:", err);
    WorkflowExecutionService.fail(
      db,
      execution.id,
      err instanceof Error ? err.message : "Unknown error"
    );
    broadcastExecutionUpdate(execution.id, "failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
  });

  return { executionId: execution.id };
}

/**
 * Run a workflow (internal async execution)
 */
async function runWorkflow(
  db: Database,
  executionId: string,
  workflow: WorkflowDefinition,
  input: Record<string, unknown>,
  actionContext: ActionContext,
  isAgentContext?: boolean
): Promise<void> {
  // Update status to running
  WorkflowExecutionService.updateStatus(db, executionId, "running");
  broadcastExecutionUpdate(executionId, "running");

  const ctx: ExecutorContext = {
    db,
    isAgentContext,
    executionId,
    workflow,
    input,
    stepOutputs: {},
    actionContext,
  };

  // Get execution order
  const levels = getExecutionOrder(workflow.steps);

  let finalOutput: Record<string, unknown> = {};

  // Execute each level
  for (const level of levels) {
    // Execute steps in parallel within a level
    const results = await Promise.all(
      level.map(async (step) => {
        const result = await executeStep(step, ctx);

        if (result.skipped) {
          WorkflowExecutionService.updateStep(db, executionId, step.id, {
            status: "skipped",
          });
          broadcastStepUpdate(executionId, step.id, "skipped");
        } else if (result.error) {
          WorkflowExecutionService.updateStep(db, executionId, step.id, {
            status: "failed",
            error: result.error,
          });
          broadcastStepUpdate(executionId, step.id, "failed", {
            error: result.error,
          });
        } else {
          ctx.stepOutputs[step.id] = result.output;
          WorkflowExecutionService.updateStep(db, executionId, step.id, {
            status: "completed",
            output: result.output,
          });
          broadcastStepUpdate(executionId, step.id, "completed", {
            output: result.output,
          });

          // Capture resolve step output
          if (step.type === "resolve" && result.output) {
            finalOutput = { ...finalOutput, ...(result.output as Record<string, unknown>) };
          }
        }

        return { step, result };
      })
    );

    // Check for failures that should stop execution
    for (const { step, result } of results) {
      if (result.error && step.type !== "action") {
        // Non-action errors are fatal
        throw new Error(result.error);
      }
      if (
        result.error &&
        step.type === "action" &&
        (!step.onError || step.onError.strategy === "fail")
      ) {
        throw new Error(result.error);
      }
    }
  }

  // Complete execution
  WorkflowExecutionService.complete(db, executionId, finalOutput);
  broadcastExecutionUpdate(executionId, "completed", { output: finalOutput });
}
