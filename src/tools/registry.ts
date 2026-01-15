/**
 * Tool Registry
 *
 * Manages registration and retrieval of tools available to agents.
 * Tools can be built-in or custom (user-defined).
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import type { ToolSet } from "ai";
import type {
  AnyToolDefinition,
  ToolCategory,
  RegisteredTool,
  ToolExecutionContext,
} from "./types.ts";
import { toAITool } from "./types.ts";

/**
 * Tool Registry singleton for managing available tools
 */
class ToolRegistryClass {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a tool
   */
  register(
    definition: AnyToolDefinition,
    options: {
      category?: ToolCategory;
      requiresCodeExecution?: boolean;
    } = {}
  ): void {
    // Skip if already registered (makes registration idempotent)
    if (this.tools.has(definition.name)) {
      return;
    }

    this.tools.set(definition.name, {
      definition,
      category: options.category ?? "other",
      requiresCodeExecution: options.requiresCodeExecution ?? false,
    });
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get a tool definition by name
   */
  getDefinition(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): RegisteredTool[] {
    return this.getAll().filter((t) => t.category === category);
  }

  /**
   * Get tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools that don't require code execution
   */
  getSafeTools(): RegisteredTool[] {
    return this.getAll().filter((t) => !t.requiresCodeExecution);
  }

  /**
   * Convert tools to Vercel AI SDK format for use with streamText/generateText
   *
   * @param toolNames - Optional list of tool names to include. If not provided, all tools are included.
   * @param context - The execution context for the tools
   * @param canExecuteCode - Whether the user has code execution permission
   * @returns A ToolSet for use with streamText/generateText
   */
  toAITools(
    context: ToolExecutionContext,
    options: {
      toolNames?: string[];
      canExecuteCode?: boolean;
    } = {}
  ): ToolSet {
    const { toolNames, canExecuteCode = false } = options;
    const result: ToolSet = {};

    for (const [name, registered] of this.tools) {
      // Filter by tool names if provided
      if (toolNames && !toolNames.includes(name)) {
        continue;
      }

      // Skip tools that require code execution if user doesn't have permission
      if (registered.requiresCodeExecution && !canExecuteCode) {
        continue;
      }

      result[name] = toAITool(registered.definition, context);
    }

    return result;
  }

  /**
   * Clear all registered tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Singleton instance of the tool registry
 */
export const ToolRegistry = new ToolRegistryClass();
