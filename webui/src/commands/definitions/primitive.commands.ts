import { z } from "zod";
import type { Command, CommandCategory, CommandArg } from "../types";
import { getAllActions, getAllPages, executeAction, getPageUrl } from "@/primitives/registry";
import type { ActionContext } from "@/primitives/types";

/**
 * Infer command category from primitive ID
 */
function inferCategory(id: string): CommandCategory {
  if (id.startsWith("git.")) return "git";
  if (id.startsWith("file.")) return "file";
  if (id.startsWith("project.")) return "project";
  if (id.startsWith("process.")) return "process";
  return "action";
}

/**
 * Fields that are auto-filled from context, not prompted
 */
const AUTO_FILL_FIELDS = new Set(["projectId", "sessionId"]);

/**
 * Convert a Zod schema to CommandArg array
 */
function zodSchemaToArgs(schema: z.ZodTypeAny): CommandArg[] {
  const args: CommandArg[] = [];

  // Get the shape from the schema
  const shape = schema._def?.shape?.();
  if (!shape) return args;

  for (const [name, fieldSchema] of Object.entries(shape)) {
    // Skip auto-fill fields
    if (AUTO_FILL_FIELDS.has(name)) continue;

    const field = fieldSchema as z.ZodTypeAny;
    const typeName = field._def?.typeName;

    // Determine if required (not optional, not nullable)
    const isOptional = typeName === "ZodOptional" || typeName === "ZodNullable";

    // Get the inner type for optional fields
    const innerType = isOptional ? field._def?.innerType : field;
    const innerTypeName = innerType?._def?.typeName;

    // Convert to CommandArg type
    let argType: "string" | "number" | "select" | "textarea" = "string";
    if (innerTypeName === "ZodNumber") {
      argType = "number";
    } else if (innerTypeName === "ZodEnum") {
      argType = "select";
    }

    // Use textarea for message-like fields
    if (name === "message" || name === "description" || name === "content") {
      argType = "textarea";
    }

    // Get description from schema
    const description = field._def?.description || field.description;

    // Build the arg
    const arg: CommandArg = {
      name,
      type: argType,
      label: formatLabel(name),
      placeholder: description,
      required: !isOptional,
    };

    // Add options for enum types
    if (innerTypeName === "ZodEnum" && innerType._def?.values) {
      arg.options = innerType._def.values.map((v: string) => ({
        value: v,
        label: v,
      }));
    }

    args.push(arg);
  }

  return args;
}

/**
 * Format a camelCase field name to a readable label
 */
function formatLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Generate commands from registered primitives (actions and pages)
 */
export function getPrimitiveCommands(): Command[] {
  const commands: Command[] = [];

  // Generate commands from actions
  for (const action of getAllActions()) {
    const category = inferCategory(action.id);
    const args = zodSchemaToArgs(action.params);

    commands.push({
      id: `action:${action.id}`,
      label: action.label,
      description: action.description,
      category,
      args: args.length > 0 ? args : undefined,
      execute: async (ctx, collectedArgs) => {
        const context: ActionContext = {
          surface: "gui",
          projectId: ctx.selectedProjectId || undefined,
        };

        // Build params from context + collected args
        const params: Record<string, unknown> = { ...collectedArgs };
        if (ctx.selectedProjectId) {
          params.projectId = ctx.selectedProjectId;
        }

        const result = await executeAction(action.id, params, context);

        if (result.type === "navigate") {
          const url = getPageUrl(result.pageId, result.params);
          ctx.navigate({ to: url });
        } else if (result.type === "error") {
          alert(result.message);
        }
      },
      when: (ctx) => {
        // Check if action requires projectId
        const shape = action.params._def?.shape?.();
        if (shape?.projectId) {
          return !!ctx.selectedProjectId;
        }
        return true;
      },
    });
  }

  // Generate commands from pages
  for (const page of getAllPages()) {
    const category = inferCategory(page.id);

    // Generate a readable label from the page
    let label: string;
    try {
      label = page.getLabel({});
    } catch {
      label = page.id.split(".").pop() || page.id;
    }

    // Get args for pages that need params beyond projectId
    const args = zodSchemaToArgs(page.params);

    commands.push({
      id: `page:${page.id}`,
      label: `Open: ${label}`,
      description: page.route,
      category,
      args: args.length > 0 ? args : undefined,
      execute: (ctx, collectedArgs) => {
        const params: Record<string, unknown> = { ...collectedArgs };

        // Add projectId if required and available
        const shape = page.params._def?.shape?.();
        if (shape?.projectId && ctx.selectedProjectId) {
          params.projectId = ctx.selectedProjectId;
        }

        try {
          const url = getPageUrl(page.id, params);
          ctx.navigate({ to: url });
        } catch (err) {
          console.warn(`Cannot navigate to ${page.id}:`, err);
        }
      },
      when: (ctx) => {
        // Check if page requires projectId
        const shape = page.params._def?.shape?.();
        if (shape?.projectId) {
          return !!ctx.selectedProjectId;
        }
        return true;
      },
    });
  }

  return commands;
}
