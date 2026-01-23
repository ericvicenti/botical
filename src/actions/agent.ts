/**
 * Agent Actions
 *
 * Actions for spawning and managing sub-agents.
 * Note: The task action is intercepted by the orchestrator for special handling.
 */

import { z } from "zod";
import { defineAction, success, error, navigate } from "./types.ts";
import { DatabaseManager } from "@/database/index.ts";
import { SessionService } from "@/services/sessions.ts";

/**
 * agent.task - Spawn a sub-agent to handle a task
 *
 * Note: This action's execute is a placeholder. The orchestrator intercepts
 * this action and handles sub-agent spawning with full database/session support.
 */
export const agentTask = defineAction({
  id: "agent.task",
  label: "Run Task",
  description: "Launch a sub-agent to handle a complex task autonomously",
  category: "agent",
  icon: "bot",

  params: z.object({
    description: z.string().min(1).max(100).describe("Short task description (3-5 words)"),
    prompt: z.string().min(1).max(50000).describe("Instructions for the sub-agent"),
    subagent_type: z.string().default("default").describe("Agent type: default, explore, or plan"),
    max_turns: z.number().int().positive().max(50).optional().describe("Max turns"),
    model: z.enum(["sonnet", "opus", "haiku"]).optional().describe("Model to use"),
    run_in_background: z.boolean().default(false).describe("Run in background"),
  }),

  execute: async ({ description, subagent_type }) => {
    // Placeholder - orchestrator intercepts and handles this
    return error(`Task "${description}" must be executed by the orchestrator. Type: ${subagent_type}`);
  },
});

/**
 * agent.newTask - Create a new task
 */
export const agentNewTask = defineAction({
  id: "agent.newTask",
  label: "New Task",
  description: "Create a new task",
  category: "agent",
  icon: "message-square-plus",

  params: z.object({
    title: z.string().optional().describe("Task title (optional)"),
  }),

  execute: async ({ title }, context) => {
    if (!context.projectId) {
      return error("No project selected");
    }

    try {
      const db = DatabaseManager.getProjectDb(context.projectId);
      const session = SessionService.create(db, {
        title: title || "New Task",
        agent: "default",
      });

      // Navigate to the new task
      return navigate("task", { sessionId: session.id, projectId: context.projectId });
    } catch (err) {
      return error(`Failed to create task: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  },
});

/**
 * All agent actions
 */
export const agentActions = [
  agentTask,
  agentNewTask,
];
