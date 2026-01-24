/**
 * Workflow Execution API Routes
 *
 * REST API endpoints for executing and monitoring workflows.
 *
 * Endpoints:
 * - POST /api/workflows/:id/execute - Start a workflow execution
 * - GET /api/workflow-executions/:id - Get execution status
 * - GET /api/workflows/:id/executions - List executions for a workflow
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { WorkflowService } from "@/services/workflows.ts";
import { WorkflowExecutionService } from "@/services/workflow-executions.ts";
import { ProjectService } from "@/services/projects.ts";
import { executeWorkflow } from "@/workflows/executor.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";
import type { ActionContext } from "@/actions/types.ts";
import { Config } from "@/config/index.ts";

const workflowExecutions = new Hono();

/**
 * POST /api/workflows/:id/execute
 * Start executing a workflow
 */
workflowExecutions.post("/workflows/:id/execute", async (c) => {
  const workflowId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const input = body.input || {};

  const db = DatabaseManager.getProjectDb(projectId);
  const workflow = WorkflowService.getByIdOrThrow(db, workflowId);

  // Validate input against workflow's input schema if defined
  // (For now, just pass through - can add validation later)

  // Create action context
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  const actionContext: ActionContext = {
    projectId,
    projectPath: project.path || Config.getProjectDir(projectId),
  };

  // Start execution (async - returns immediately with execution ID)
  const { executionId } = await executeWorkflow(
    db,
    workflow,
    input,
    actionContext
  );

  return c.json({
    data: {
      executionId,
      workflowId,
      status: "pending",
    },
  }, 201);
});

/**
 * GET /api/workflow-executions/:id
 * Get execution status and details
 */
workflowExecutions.get("/workflow-executions/:id", async (c) => {
  const executionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (projectId) {
    // Fast path
    const db = DatabaseManager.getProjectDb(projectId);
    const execution = WorkflowExecutionService.getByIdOrThrow(db, executionId);
    return c.json({ data: execution });
  }

  // Slow path: search all projects
  const rootDb = DatabaseManager.getRootDb();
  const projects = ProjectService.list(rootDb, { limit: 100 });

  for (const project of projects) {
    try {
      const db = DatabaseManager.getProjectDb(project.id);
      const execution = WorkflowExecutionService.getById(db, executionId);
      if (execution) {
        return c.json({ data: execution });
      }
    } catch {
      // Skip project
    }
  }

  throw new NotFoundError("Workflow execution", executionId);
});

/**
 * GET /api/workflows/:id/executions
 * List executions for a workflow
 */
workflowExecutions.get("/workflows/:id/executions", async (c) => {
  const workflowId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  const db = DatabaseManager.getProjectDb(projectId);

  // Verify workflow exists
  WorkflowService.getByIdOrThrow(db, workflowId);

  const executions = WorkflowExecutionService.listByWorkflow(db, workflowId, {
    limit,
    offset,
  });

  return c.json({
    data: executions,
    meta: {
      limit,
      offset,
    },
  });
});

export { workflowExecutions };
