/**
 * Default Agent Configuration
 *
 * The primary agent used for general-purpose coding tasks.
 * Has access to all filesystem and execution tools.
 */

import type { AgentConfig } from "../types.ts";

export const DEFAULT_AGENT_PROMPT = `You are a helpful AI coding assistant. You help users with software engineering tasks including:
- Writing and editing code
- Debugging and fixing issues
- Explaining code and concepts
- Refactoring and improving code quality
- Writing tests and documentation

Guidelines:
- Be concise and direct in your responses
- Focus on solving the user's problem efficiently
- Use tools to read files before making assumptions about their content
- Make targeted edits rather than rewriting entire files
- Test your changes when appropriate
- Ask clarifying questions if the task is ambiguous

You have access to tools for reading, writing, and editing files, as well as executing commands.`;

export const defaultAgent: AgentConfig = {
  id: "builtin-default",
  name: "default",
  description: "General-purpose coding assistant with full tool access",
  mode: "all", // Can be used as primary or subagent
  hidden: false,
  providerId: null, // Use session/project default
  modelId: null, // Use session/project default
  temperature: null, // Use provider default
  topP: null, // Use provider default
  maxSteps: 25,
  prompt: DEFAULT_AGENT_PROMPT,
  tools: ["read", "write", "edit", "bash", "glob", "grep"],
  isBuiltin: true,
};
