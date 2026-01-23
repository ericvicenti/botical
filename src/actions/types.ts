/**
 * Iris Actions Type System
 *
 * Defines the unified action interface that works for both:
 * - AI agent tool calls
 * - GUI command palette actions
 *
 * Actions are the building blocks of Iris - they represent operations
 * that can be performed on a project, whether triggered by an AI agent
 * or a user clicking in the UI.
 */

import { z } from "zod";

// ============================================================================
// Action Categories
// ============================================================================

/**
 * Categories for organizing actions
 */
export type ActionCategory =
  | "file"      // File operations (read, write, edit)
  | "search"    // Search operations (glob, grep)
  | "shell"     // Shell/command execution
  | "service"   // Background service management
  | "git"       // Git operations
  | "agent"     // Agent/sub-agent operations
  | "project"   // Project management
  | "navigation" // UI navigation
  | "other";

// All actions are universal - available to both agents and GUI

// ============================================================================
// Action Context
// ============================================================================

/**
 * Context provided when executing an action
 *
 * For agent calls: Full context with project paths and session info
 * For GUI calls: May have limited context (e.g., just selectedProjectId)
 */
export interface ActionContext {
  // Project context (always available)
  projectId: string;
  projectPath: string;

  // Session context (for agent calls)
  sessionId?: string;
  messageId?: string;
  userId?: string;

  // Execution control
  abortSignal?: AbortSignal;

  // GUI context (for command palette)
  navigate?: (opts: { to: string }) => void;

  // Progress reporting
  updateProgress?: (update: ActionProgressUpdate) => void;
}

/**
 * Progress update during action execution
 */
export interface ActionProgressUpdate {
  title?: string;
  description?: string;
  progress?: number; // 0-1
  data?: Record<string, unknown>;
}

// ============================================================================
// Action Results
// ============================================================================

/**
 * Result returned by action execution
 */
export type ActionResult =
  | ActionSuccessResult
  | ActionErrorResult
  | ActionNavigateResult
  | ActionUIResult;

export interface ActionSuccessResult {
  type: "success";
  /** Title shown in UI */
  title: string;
  /** Output text (shown to user and returned to agent) */
  output: string;
  /** Optional structured data */
  metadata?: Record<string, unknown>;
}

export interface ActionErrorResult {
  type: "error";
  /** Error message */
  message: string;
  /** Optional error code */
  code?: string;
}

export interface ActionNavigateResult {
  type: "navigate";
  /** Page ID to navigate to */
  pageId: string;
  /** Params for the page */
  params: Record<string, unknown>;
}

export interface ActionUIResult {
  type: "ui";
  /** UI action to perform */
  action: string;
  /** Value for the UI action */
  value: unknown;
  /** Message to show */
  message?: string;
}

// ============================================================================
// Action Definition
// ============================================================================

/**
 * Full action definition with type-safe parameters
 */
export interface ActionDefinition<TParams extends z.ZodType = z.ZodType<unknown>> {
  // Identity
  id: string;                    // e.g., "git.commit", "file.read"
  label: string;                 // Human-readable label
  description: string;           // Description for AI and UI

  // Categorization
  category: ActionCategory;

  // Parameters (Zod schema)
  params: TParams;

  // Execution
  execute: (
    params: z.infer<TParams>,
    context: ActionContext
  ) => Promise<ActionResult>;

  // Optional UI hints
  icon?: string;                 // Lucide icon name
  shortcut?: string;             // Keyboard shortcut (e.g., "mod+shift+g")

  // Conditional availability
  when?: (context: Partial<ActionContext>) => boolean;
}

/**
 * Loosely typed action definition for storage in registry
 * (avoids TypeScript variance issues with generics)
 */
export interface AnyActionDefinition {
  id: string;
  label: string;
  description: string;
  category: ActionCategory;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: z.ZodType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (params: any, context: ActionContext) => Promise<ActionResult>;
  icon?: string;
  shortcut?: string;
  when?: (context: Partial<ActionContext>) => boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Define an action with full type inference
 */
export function defineAction<TParams extends z.ZodType>(
  config: ActionDefinition<TParams>
): ActionDefinition<TParams> {
  return config;
}

/**
 * Create a success result
 */
export function success(
  title: string,
  output: string,
  metadata?: Record<string, unknown>
): ActionSuccessResult {
  return { type: "success", title, output, metadata };
}

/**
 * Create an error result
 */
export function error(message: string, code?: string): ActionErrorResult {
  return { type: "error", message, code };
}

/**
 * Create a navigation result
 */
export function navigate(
  pageId: string,
  params: Record<string, unknown> = {}
): ActionNavigateResult {
  return { type: "navigate", pageId, params };
}

/**
 * Create a UI action result
 */
export function ui(
  action: string,
  value: unknown,
  message?: string
): ActionUIResult {
  return { type: "ui", action, value, message };
}
