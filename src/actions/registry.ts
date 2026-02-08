/**
 * Botical Action Registry
 *
 * Central registry for all actions in the system. Actions registered here
 * are available to both AI agents (as tools) and the GUI (command palette).
 */

import type { ToolSet, Tool } from "ai";
import type {
  AnyActionDefinition,
  ActionCategory,
  ActionContext,
  ActionResult,
  ActionUIResult,
  ActionNavigateResult,
} from "./types.ts";
import { ConnectionManager, createEvent } from "@/websocket/index.ts";

/**
 * Registered action with metadata
 */
export interface RegisteredAction {
  definition: AnyActionDefinition;
}

/**
 * Options for converting actions to AI SDK tools
 */
export interface ToToolsOptions {
  /** Filter to specific action IDs */
  actionIds?: string[];
  /** Filter by category */
  categories?: ActionCategory[];
}

/**
 * Action Registry - singleton that manages all registered actions
 */
class ActionRegistryClass {
  private actions: Map<string, RegisteredAction> = new Map();

  /**
   * Register an action
   */
  register(definition: AnyActionDefinition): void {
    if (this.actions.has(definition.id)) {
      // Already registered, skip (makes registration idempotent)
      return;
    }

    this.actions.set(definition.id, { definition });
  }

  /**
   * Unregister an action
   */
  unregister(id: string): boolean {
    return this.actions.delete(id);
  }

  /**
   * Get an action by ID
   */
  get(id: string): RegisteredAction | undefined {
    return this.actions.get(id);
  }

  /**
   * Get action definition by ID
   */
  getDefinition(id: string): AnyActionDefinition | undefined {
    return this.actions.get(id)?.definition;
  }

  /**
   * Check if an action exists
   */
  has(id: string): boolean {
    return this.actions.has(id);
  }

  /**
   * Get all registered actions
   */
  getAll(): RegisteredAction[] {
    return Array.from(this.actions.values());
  }

  /**
   * Get all action IDs
   */
  getIds(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Get actions by category
   */
  getByCategory(category: ActionCategory): RegisteredAction[] {
    return this.getAll().filter((a) => a.definition.category === category);
  }

  /**
   * Execute an action by ID
   */
  async execute(
    id: string,
    params: unknown,
    context: ActionContext
  ): Promise<ActionResult> {
    const action = this.actions.get(id);
    if (!action) {
      return { type: "error", message: `Action "${id}" not found` };
    }

    const parsed = action.definition.params.safeParse(params);
    if (!parsed.success) {
      return {
        type: "error",
        message: `Invalid params: ${parsed.error.message}`,
      };
    }

    try {
      return await action.definition.execute(parsed.data, context);
    } catch (err) {
      return {
        type: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * Convert actions to Vercel AI SDK tools for use with streamText/generateText
   */
  toAITools(context: ActionContext, options: ToToolsOptions = {}): ToolSet {
    const { actionIds, categories } = options;

    const tools: ToolSet = {};

    for (const [id, registered] of this.actions) {
      const def = registered.definition;

      // Filter by action IDs
      if (actionIds && !actionIds.includes(id)) {
        continue;
      }

      // Filter by category
      if (categories && !categories.includes(def.category)) {
        continue;
      }

      // Check conditional availability
      if (def.when && !def.when(context)) {
        continue;
      }

      // Convert to AI SDK tool
      const tool: Tool = {
        description: def.description,
        inputSchema: def.params,
        execute: async (args) => {
          const result = await def.execute(args, context);

          if (result.type === "success") {
            return result.output;
          } else if (result.type === "error") {
            return `Error: ${result.message}`;
          } else if (result.type === "navigate") {
            // Broadcast navigation to all connected frontend clients
            this.broadcastNavigate(result);
            return `Navigating to: ${result.pageId}`;
          } else if (result.type === "ui") {
            // Broadcast UI action to all connected frontend clients
            this.broadcastUIAction(result);
            return result.message || `UI action: ${result.action}`;
          }

          return "Unknown result";
        },
      };

      // Use action ID as tool name (replace dots with underscores for compatibility)
      const toolName = id.replace(/\./g, "_");
      tools[toolName] = tool;
    }

    return tools;
  }

  /**
   * Broadcast a UI action to all connected frontend clients
   */
  private broadcastUIAction(result: ActionUIResult): void {
    const event = createEvent("ui.action", {
      action: result.action,
      value: result.value,
      message: result.message,
    });

    // Broadcast to all connected clients
    for (const connectionId of ConnectionManager.getAllIds()) {
      ConnectionManager.send(connectionId, event);
    }
  }

  /**
   * Broadcast a navigation event to all connected frontend clients
   */
  private broadcastNavigate(result: ActionNavigateResult): void {
    const event = createEvent("ui.navigate", {
      pageId: result.pageId,
      params: result.params,
    });

    // Broadcast to all connected clients
    for (const connectionId of ConnectionManager.getAllIds()) {
      ConnectionManager.send(connectionId, event);
    }
  }

  /**
   * Clear all registered actions (useful for testing)
   */
  clear(): void {
    this.actions.clear();
  }
}

/**
 * Singleton instance of the action registry
 */
export const ActionRegistry = new ActionRegistryClass();
