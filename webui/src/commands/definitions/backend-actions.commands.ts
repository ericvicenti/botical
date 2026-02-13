/**
 * Backend Actions Commands
 *
 * Converts backend actions (from /api/tools/actions) to frontend commands
 * for the command palette.
 */

import type { Command, CommandCategory, CommandArg } from "../types";
import type { BackendAction, BackendActionParam } from "@/lib/api/types";
import { apiClient } from "@/lib/api/client";

/**
 * Fields that are auto-filled from context, not prompted
 */
const AUTO_FILL_FIELDS = new Set(["projectId", "sessionId"]);

/**
 * Infer command category from action ID
 */
function inferCategory(id: string): CommandCategory {
  if (id.startsWith("git.")) return "git";
  if (id.startsWith("file.")) return "file";
  if (id.startsWith("project.")) return "project";
  if (id.startsWith("process.") || id.startsWith("shell.")) return "process";
  if (id.startsWith("view.")) return "view";
  return "action";
}

/**
 * Format a camelCase/snake_case field name to a readable label
 */
function formatLabel(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Convert backend action param to frontend CommandArg
 */
function paramToArg(param: BackendActionParam): CommandArg | null {
  // Skip auto-fill fields
  if (AUTO_FILL_FIELDS.has(param.name)) {
    return null;
  }

  let argType: "string" | "number" | "select" | "textarea" = "string";

  if (param.type === "number") {
    argType = "number";
  } else if (param.type === "enum" && param.options) {
    argType = "select";
  }

  // Use textarea for message-like fields
  if (param.name === "message" || param.name === "description" || param.name === "content" || param.name === "prompt") {
    argType = "textarea";
  }

  const arg: CommandArg = {
    name: param.name,
    type: argType,
    label: formatLabel(param.name),
    placeholder: param.description,
    required: param.required,
  };

  if (param.options) {
    arg.options = param.options.map((v) => ({
      value: v,
      label: v,
    }));
  }

  return arg;
}

/**
 * Execute a backend action via API
 */
async function executeBackendAction(
  actionId: string,
  params: Record<string, unknown>,
  projectId: string | null
): Promise<{ type: string; message?: string; [key: string]: unknown }> {
  const response = await apiClient<{
    type: string;
    message?: string;
    [key: string]: unknown;
  }>("/api/tools/actions/execute", {
    method: "POST",
    body: JSON.stringify({
      actionId,
      params: {
        ...params,
        projectId: projectId || undefined,
      },
    }),
  });
  return response;
}

/**
 * Actions that should be intercepted and handled specially in the frontend
 */
const INTERCEPTED_ACTIONS = new Set(["agent.newTask"]);

/**
 * Convert a backend action to a frontend Command
 */
export function backendActionToCommand(action: BackendAction): Command {
  const category = inferCategory(action.id);
  const args: CommandArg[] = [];

  // For intercepted actions, don't add args - they'll be handled specially
  if (!INTERCEPTED_ACTIONS.has(action.id)) {
    for (const param of action.params) {
      const arg = paramToArg(param);
      if (arg) {
        args.push(arg);
      }
    }
  }

  return {
    id: `backend:${action.id}`,
    label: action.label,
    description: action.description,
    category,
    args: args.length > 0 ? args : undefined,
    execute: async (ctx, collectedArgs) => {
      // Handle intercepted actions specially
      if (action.id === "agent.newTask") {
        ctx.ui.openNewTaskModal();
        return;
      }

      // Show running dialog for commands that take time
      const showProgress = action.category === "shell" || action.id.includes("run");
      // Extract command string for display (used by shell.run)
      const commandStr = typeof collectedArgs.command === "string" ? collectedArgs.command : null;
      if (showProgress) {
        ctx.feedback.showRunning(
          action.label,
          commandStr ? `$ ${commandStr}` : `Executing: ${action.id}`
        );
      }

      try {
        const result = await executeBackendAction(
          action.id,
          collectedArgs,
          ctx.selectedProjectId
        );

        // Hide running dialog
        if (showProgress) {
          ctx.feedback.hideRunning();
        }

        // Invalidate processes query for shell/process actions (they record commands)
        if (ctx.selectedProjectId && (action.category === "shell" || action.id.startsWith("process."))) {
          ctx.queryClient.invalidateQueries({
            queryKey: ["projects", ctx.selectedProjectId, "processes"],
          });
        }

        if (result.type === "navigate" && result.pageId) {
          // Handle navigation results
          const pageId = result.pageId as string;
          const params = result.params as Record<string, unknown> || {};

          // Map common page IDs to routes
          if (pageId === "file") {
            ctx.navigate({ to: `/projects/${ctx.selectedProjectId}/files/${encodeURIComponent(params.path as string || "")}` });
          } else if (pageId === "task") {
            ctx.navigate({ to: `/projects/${ctx.selectedProjectId}/tasks/${params.sessionId}` });
          } else if (pageId === "settings") {
            ctx.navigate({ to: "/settings" });
          } else if (pageId === "project") {
            ctx.navigate({ to: `/projects/${params.projectId}` });
          } else if (pageId === "workflow") {
            ctx.navigate({ to: `/workflows/${params.workflowId}` });
          }
        } else if (result.type === "ui") {
          // Handle UI actions with toast feedback
          const uiAction = result.action as string;
          const value = result.value;
          const message = result.message as string | undefined;

          if (uiAction === "setTheme" && typeof value === "string") {
            ctx.ui.setTheme(value as "dark" | "light" | "system");
            ctx.feedback.showToast(message || `Theme: ${value}`, "success");
          } else if (uiAction === "toggleSidebar") {
            ctx.ui.toggleSidebar();
            ctx.feedback.showToast(message || "Sidebar toggled", "success");
          } else if (uiAction === "setSidebarPanel" && typeof value === "string") {
            ctx.ui.setSidebarPanel(value as any);
            ctx.feedback.showToast(message || `Panel: ${value}`, "success");
          } else if (uiAction === "closeTab") {
            if (value === "active" && ctx.activeTabId) {
              ctx.tabActions.closeTab(ctx.activeTabId);
            } else if (typeof value === "string") {
              ctx.tabActions.closeTab(value);
            }
            ctx.feedback.showToast(message || "Tab closed", "success");
          } else if (uiAction === "closeAllTabs") {
            ctx.tabActions.closeAllTabs();
            ctx.feedback.showToast(message || "All tabs closed", "success");
          }
        } else if (result.type === "error") {
          const message = result.message || "Action failed";
          // Short errors go to toast, long ones to dialog
          if (message.length < 100) {
            ctx.feedback.showToast(message, "error");
          } else {
            // Prepend command if available
            const fullOutput = commandStr ? `$ ${commandStr}\n\n${message}` : message;
            ctx.feedback.showResult(action.label, fullOutput, "error");
          }
        } else if (result.type === "success") {
          const title = (result.title as string) || action.label;
          const output = result.output as string | undefined;

          // If there's output, show in dialog
          if (output && output.length > 0) {
            // Prepend command if available
            const fullOutput = commandStr ? `$ ${commandStr}\n\n${output}` : output;
            ctx.feedback.showResult(title, fullOutput, "success");
          } else {
            // No output - just show title as toast
            ctx.feedback.showToast(title, "success");
          }
        }
      } catch (err) {
        // Hide running dialog on error
        if (showProgress) {
          ctx.feedback.hideRunning();
        }
        console.error(`Failed to execute action ${action.id}:`, err);
        ctx.feedback.showToast(
          `Action failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          "error"
        );
      }
    },
    when: (ctx) => {
      // Check if action requires projectId
      const needsProject = action.params.some((p) => p.name === "projectId" && p.required);
      if (needsProject) {
        return !!ctx.selectedProjectId;
      }
      return true;
    },
  };
}

/**
 * Convert all backend actions to commands
 */
export function convertBackendActions(actions: BackendAction[]): Command[] {
  return actions.map(backendActionToCommand);
}
