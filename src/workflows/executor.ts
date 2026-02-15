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
import { CircuitBreakerRegistry } from "@/utils/circuit-breaker.ts";
import { classifyError, isRetryableError, getRetryDelay } from "@/utils/error-classification.ts";

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
 * Execute a step with retry logic and exponential backoff
 */
async function executeStepWithRetry(
  step: WorkflowStep,
  ctx: ExecutorContext,
  errorHandling: { strategy: "retry"; retryCount?: number; retryDelay?: number }
): Promise<{ output?: unknown; error?: string }> {
  const maxRetries = errorHandling.retryCount || 3;
  const baseDelay = errorHandling.retryDelay || 1000; // 1 second default
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // If this is a retry attempt, wait with exponential backoff
      if (attempt > 0) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        const jitter = Math.random() * 0.1 * delay; // Add 10% jitter to prevent thundering herd
        const totalDelay = delay + jitter;
        
        console.log(`[Workflow ${ctx.executionId}] Retrying step ${step.id} (attempt ${attempt + 1}/${maxRetries + 1}) after ${Math.round(totalDelay)}ms`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
      
      // Execute the step (without the outer try-catch that handles retries)
      const result = await executeStepCore(step, ctx);
      
      // If we get here, the step succeeded
      if (attempt > 0) {
        console.log(`[Workflow ${ctx.executionId}] Step ${step.id} succeeded on retry attempt ${attempt + 1}`);
      }
      
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      // If this was the last attempt, don't continue
      if (attempt === maxRetries) {
        break;
      }
      
      // Classify the error to determine if it should be retried
      const errorClassification = classifyError(lastError);
      
      if (!errorClassification.shouldRetry) {
        console.log(`[Workflow ${ctx.executionId}] Step ${step.id} failed with non-retryable error: ${lastError.message} (${errorClassification.reason})`);
        break; // Exit retry loop immediately for non-retryable errors
      }
      
      console.log(`[Workflow ${ctx.executionId}] Step ${step.id} failed on attempt ${attempt + 1}: ${lastError.message} (${errorClassification.reason})`);
    }
  }
  
  // All retries exhausted
  const errorMessage = lastError?.message || "Unknown error";
  console.log(`[Workflow ${ctx.executionId}] Step ${step.id} failed after ${maxRetries + 1} attempts: ${errorMessage}`);
  
  return {
    output: {
      error: errorMessage,
      retryFailed: true,
      attempts: maxRetries + 1,
      lastAttemptAt: Date.now(),
    }
  };
}

/**
 * Execute a single step (core logic without retry handling)
 */
async function executeStepCore(
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

  switch (step.type) {
    case "action": {
      if (!step.action) {
        throw new Error("Action step missing action ID");
      }

      const resolvedArgs = resolveArgs(step.args, ctx);
      WorkflowExecutionService.updateStep(ctx.db, ctx.executionId, step.id, {
        resolvedArgs,
      });

      // Use circuit breaker for action execution
      const circuitBreakerKey = `action:${step.action}`;
      const circuitBreaker = CircuitBreakerRegistry.getOrCreate(circuitBreakerKey, {
        failureThreshold: 5,
        resetTimeout: 30000, // 30 seconds
        monitoringPeriod: 60000, // 1 minute
        name: `Action-${step.action}`,
      });

      const result = await circuitBreaker.execute(async () => {
        return await ActionRegistry.execute(
          step.action,
          resolvedArgs,
          ctx.actionContext
        );
      });

      return handleActionResult(result);
    }

    case "notify": {
      const message = String(resolveBinding(step.message, ctx) || "");
      const variant = (step.variant as "info" | "success" | "warning" | "error") || "info";
      
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

    case "session": {
      const message = String(resolveBinding(step.message, ctx) || "");
      if (!message) {
        throw new Error("Session step missing message");
      }

      const agent = String(resolveBinding(step.agent, ctx) || "default");
      const systemPrompt = step.systemPrompt ? String(resolveBinding(step.systemPrompt, ctx) || "") : null;
      const providerId = step.providerId ? String(resolveBinding(step.providerId, ctx) || "") : null;
      const modelId = step.modelId ? String(resolveBinding(step.modelId, ctx) || "") : null;
      const maxMessages = step.maxMessages ? Number(resolveBinding(step.maxMessages, ctx) || 10) : 10;

      return await executeSessionStep({
        message,
        agent,
        systemPrompt,
        providerId,
        modelId,
        maxMessages,
        ctx,
      });
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
      throw new Error(message);
    }

    case "approval": {
      const message = String(resolveBinding(step.message, ctx) || "Approval required");
      const approvers = step.approvers ? resolveBinding(step.approvers, ctx) : null;
      const timeout = step.timeout ? Number(resolveBinding(step.timeout, ctx)) : null;
      const autoApprove = step.autoApprove ? Boolean(resolveBinding(step.autoApprove, ctx)) : false;

      return await executeApprovalStep({
        message,
        approvers,
        timeout,
        autoApprove,
        stepId: step.id,
        ctx,
      });
    }

    case "workflow": {
      const workflowId = step.workflowId ? String(resolveBinding(step.workflowId, ctx) || "") : null;
      const workflowName = step.workflowName ? String(resolveBinding(step.workflowName, ctx) || "") : null;
      
      if (!workflowId && !workflowName) {
        throw new Error("Workflow step must specify either workflowId or workflowName");
      }
      
      if (workflowId && workflowName) {
        throw new Error("Workflow step cannot specify both workflowId and workflowName");
      }

      const input = resolveArgs(step.input, ctx);

      return await executeWorkflowStep({
        workflowId,
        workflowName,
        input,
        ctx,
      });
    }

    default:
      throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
  }
}

/**
 * Execute a single step (main entry point with error handling)
 */
async function executeStep(
  step: WorkflowStep,
  ctx: ExecutorContext
): Promise<{ output?: unknown; error?: string; skipped?: boolean }> {
  try {
    return await executeStepCore(step, ctx);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Handle error based on step's onError config
    if ((step.type === "action" || step.type === "session" || step.type === "workflow") && step.onError) {
      switch (step.onError.strategy) {
        case "continue":
          return { output: { error: errorMessage, continued: true } };
        case "retry":
          return await executeStepWithRetry(step, ctx, step.onError);
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
// Session Step Execution
// ============================================================================

/**
 * Execute a session step by creating a sub-agent session
 */
async function executeSessionStep(params: {
  message: string;
  agent: string;
  systemPrompt: string | null;
  providerId: string | null;
  modelId: string | null;
  maxMessages: number;
  ctx: ExecutorContext;
}): Promise<{ output?: unknown; error?: string }> {
  const { message, agent, systemPrompt, providerId, modelId, maxMessages, ctx } = params;

  try {
    // Import services (dynamic import to avoid circular dependencies)
    const { SessionService } = await import("@/services/sessions.ts");
    const { MessageService } = await import("@/services/messages.ts");
    const { MessagePartService } = await import("@/services/messages.ts");
    const { AgentOrchestrator } = await import("@/agents/orchestrator.ts");

    // Create a sub-session
    const session = SessionService.create(ctx.db, {
      title: `Workflow Session: ${ctx.workflow.name}`,
      agent,
      parentId: ctx.actionContext.sessionId || null,
      providerId,
      modelId,
      systemPrompt,
    });

    // Create the initial user message
    const userMessage = MessageService.create(ctx.db, {
      sessionId: session.id,
      role: "user",
    });

    MessagePartService.create(ctx.db, {
      messageId: userMessage.id,
      sessionId: session.id,
      type: "text",
      content: { text: message },
    });

    // Update session stats
    SessionService.updateStats(ctx.db, session.id, { messageCount: 1 });

    // Process the message with the agent
    const orchestrator = new AgentOrchestrator(ctx.db);
    await orchestrator.processMessage(session.id, userMessage.id, {
      maxMessages,
    });

    // Get the final session state
    const finalSession = SessionService.getByIdOrThrow(ctx.db, session.id);
    
    // Get all messages from the session
    const { MessageService: MsgSvc } = await import("@/services/messages.ts");
    const messages = MsgSvc.list(ctx.db, session.id);
    
    // Extract the assistant's response(s)
    const assistantMessages = messages.filter(m => m.role === "assistant");
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    
    let responseText = "";
    if (lastAssistantMessage) {
      const { MessagePartService: PartSvc } = await import("@/services/messages.ts");
      const parts = PartSvc.list(ctx.db, lastAssistantMessage.id);
      const textParts = parts.filter(p => p.type === "text");
      responseText = textParts.map(p => p.content.text).join("\n");
    }

    return {
      output: {
        sessionId: session.id,
        messageCount: finalSession.messageCount,
        totalCost: finalSession.totalCost,
        response: responseText,
        status: finalSession.status,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Session execution failed",
    };
  }
}

// ============================================================================
// Approval Step Execution
// ============================================================================

/**
 * Execute an approval step by creating an approval request
 */
async function executeApprovalStep(params: {
  message: string;
  approvers: unknown;
  timeout: number | null;
  autoApprove: boolean;
  stepId: string;
  ctx: ExecutorContext;
}): Promise<{ output?: unknown; error?: string }> {
  const { message, approvers, timeout, autoApprove, stepId, ctx } = params;

  try {
    // Import services (dynamic import to avoid circular dependencies)
    const { ApprovalRequestService } = await import("@/services/approval-requests.ts");
    const { ProjectService } = await import("@/services/projects.ts");

    // Determine approvers - default to all project members
    let approverIds: string[];
    if (Array.isArray(approvers)) {
      approverIds = approvers.map(String);
    } else {
      // Get all project members as default approvers
      const members = ProjectService.listMembers(ctx.db, ctx.workflow.projectId);
      approverIds = members.map(m => m.userId);
    }

    if (approverIds.length === 0) {
      return { error: "No approvers available for approval step" };
    }

    // Create the approval request
    const approval = ApprovalRequestService.create(ctx.db, {
      executionId: ctx.executionId,
      stepId: stepId,
      message,
      approvers: approverIds,
      timeoutMs: timeout,
      autoApprove,
    });

    // Broadcast approval request to all approvers
    const event = createEvent("workflow.approval.required", {
      approvalId: approval.id,
      workflowExecutionId: ctx.executionId,
      stepId: stepId,
      message,
      approvers: approverIds,
      timeout,
    });

    for (const connectionId of ConnectionManager.getAllIds()) {
      ConnectionManager.send(connectionId, event);
    }

    // For now, return pending state - the approval will be resolved externally
    // In a full implementation, this would wait for the approval or timeout
    return {
      output: {
        approvalId: approval.id,
        status: "pending",
        message,
        approvers: approverIds,
        timeout,
        createdAt: approval.createdAt,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Approval step execution failed",
    };
  }
}

// ============================================================================
// Workflow Step Execution
// ============================================================================

/**
 * Execute a workflow step by invoking another workflow
 */
async function executeWorkflowStep(params: {
  workflowId: string | null;
  workflowName: string | null;
  input: Record<string, unknown>;
  ctx: ExecutorContext;
}): Promise<{ output?: unknown; error?: string }> {
  const { workflowId, workflowName, input, ctx } = params;

  try {
    // Import services (dynamic import to avoid circular dependencies)
    const { UnifiedWorkflowService } = await import("@/services/workflows-unified.ts");
    const { ProjectService } = await import("@/services/projects.ts");

    // Get the project path
    const project = ProjectService.getById(ctx.db, ctx.workflow.projectId);
    if (!project?.path) {
      throw new Error("Project path not found for workflow execution");
    }

    // Find the target workflow
    let targetWorkflow;
    if (workflowId) {
      targetWorkflow = UnifiedWorkflowService.getById(
        ctx.db,
        ctx.workflow.projectId,
        project.path,
        workflowId
      );
    } else if (workflowName) {
      targetWorkflow = UnifiedWorkflowService.getByName(
        ctx.db,
        ctx.workflow.projectId,
        project.path,
        workflowName
      );
    }

    if (!targetWorkflow) {
      const identifier = workflowId || workflowName;
      throw new Error(`Workflow not found: ${identifier}`);
    }

    // Prevent infinite recursion by checking if we're calling ourselves
    if (targetWorkflow.id === ctx.workflow.id) {
      throw new Error("Workflow cannot call itself (infinite recursion detected)");
    }

    // Execute the target workflow
    const { executeWorkflow } = await import("@/workflows/executor.ts");
    const result = await executeWorkflow(
      ctx.db,
      targetWorkflow,
      input,
      ctx.actionContext,
      { isAgentContext: ctx.isAgentContext }
    );

    // Wait for the workflow to complete
    const { WorkflowExecutionService } = await import("@/services/workflow-executions.ts");
    
    // Poll for completion (in a real implementation, this could use WebSocket events)
    let execution;
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes at 1 second intervals
    
    do {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      execution = WorkflowExecutionService.getById(ctx.db, result.executionId);
      attempts++;
    } while (
      execution && 
      (execution.status === "pending" || execution.status === "running") && 
      attempts < maxAttempts
    );

    if (!execution) {
      throw new Error("Workflow execution not found");
    }

    if (execution.status === "failed") {
      throw new Error(execution.error || "Workflow execution failed");
    }

    if (execution.status === "cancelled") {
      throw new Error("Workflow execution was cancelled");
    }

    if (attempts >= maxAttempts) {
      throw new Error("Workflow execution timed out");
    }

    return {
      output: {
        executionId: result.executionId,
        workflowId: targetWorkflow.id,
        workflowName: targetWorkflow.name,
        status: execution.status,
        output: execution.output,
        completedAt: execution.completedAt,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Workflow execution failed",
    };
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
