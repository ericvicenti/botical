/**
 * Iris Apps Type Definitions
 *
 * Core types for the Iris Apps system with Server-Defined Rendering (SDR).
 * Apps are single-file TypeScript modules that define state, tools, and UI.
 */

import { z } from "zod";

// ============================================================================
// App Manifest Schema
// ============================================================================

/**
 * App manifest schema (app.json)
 * Defines metadata, permissions, and configuration for an Iris App.
 */
export const AppManifestSchema = z.object({
  // Identity
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Name must be lowercase alphanumeric with dashes"),
  displayName: z.string(),
  version: z.string().default("0.1.0"),
  description: z.string().optional(),
  icon: z.string().optional(), // Emoji or icon name

  // Entry points
  server: z.string().default("server.ts"),

  // UI mode (SDR is default, custom is escape hatch)
  ui: z
    .object({
      mode: z.enum(["sdr", "custom"]).default("sdr"),
      entry: z.string().optional(), // For custom mode: ui/index.html
    })
    .default({ mode: "sdr" }),

  // Tools exposed to AI agents
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
      })
    )
    .default([]),

  // Permissions required
  permissions: z.array(z.string()).default([]),

  // Services to run in background
  services: z
    .array(
      z.object({
        name: z.string(),
        command: z.string(),
        autoStart: z.boolean().default(false),
      })
    )
    .default([]),
});

export type AppManifest = z.infer<typeof AppManifestSchema>;

// ============================================================================
// SDR Component Tree Types
// ============================================================================

/**
 * Action descriptor for event handlers
 * Serialized in the component tree as { $action: "toolName", args: {...} }
 */
export interface ActionDescriptor {
  $action: string;
  args?: unknown;
  optimistic?: Record<string, unknown>; // Optimistic state updates
}

/**
 * Primitive prop values
 */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | PropValue[]
  | { [key: string]: PropValue }
  | ActionDescriptor;

/**
 * Component node in the SDR tree
 */
export interface ComponentNode {
  /** Marker to identify component nodes */
  $: "component";
  /** Component type from registry (e.g., "Stack", "Button") */
  type: string;
  /** Props passed to the component */
  props: Record<string, PropValue>;
  /** Child nodes */
  children?: UIChild[];
  /** Unique key for list rendering */
  key?: string;
}

/**
 * Child element in the UI tree
 */
export type UIChild = string | number | boolean | null | undefined | ComponentNode;

/**
 * Root UI tree returned by app's ui() function
 */
export type UITree = ComponentNode | null;

// ============================================================================
// App State Types
// ============================================================================

/**
 * State handle for reactive state management
 */
export interface StateHandle<T> {
  /** Get current value */
  get(): T;
  /** Set new value */
  set(value: T): void;
  /** Update with function */
  update(updater: (prev: T) => T): void;
  /** Subscribe to changes */
  subscribe(listener: (value: T) => void): () => void;
  /** Snapshot for serialization */
  toJSON(): T;
}

/**
 * State definition in app
 */
export type StateDefinition = Record<string, StateHandle<unknown>>;

// ============================================================================
// App Context Types
// ============================================================================

/**
 * Context provided to app's ui() function and tools
 */
export interface AppContext {
  /** App's reactive state */
  state: Record<string, StateHandle<unknown>>;

  /** Run a tool by name */
  runTool(name: string, args?: unknown): Promise<unknown>;

  /** Access to Iris platform */
  iris: IrisPlatformContext;
}

/**
 * Iris platform access (AI, filesystem, etc.)
 */
export interface IrisPlatformContext {
  /** AI model access */
  ai: {
    chat(
      messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
      options?: { model?: string }
    ): Promise<{ content: string }>;
  };

  /** Filesystem access (scoped to project) */
  fs: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    list(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>;
  };

  /** Navigate to a route in Iris */
  navigate(path: string): void;

  /** Show a notification */
  notify(message: string, options?: { type?: "info" | "success" | "error" }): void;

  /** Project info */
  project: {
    id: string;
    path: string;
    name: string;
  };
}

// ============================================================================
// App Definition Types
// ============================================================================

/**
 * Tool definition within an app
 */
export interface AppToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType<unknown>;
  execute: (args: unknown, ctx: AppContext) => Promise<unknown>;
}

/**
 * App definition returned by defineApp()
 */
export interface AppDefinition {
  /** Initial state factories */
  state?: Record<string, () => StateHandle<unknown>>;

  /** Tools exposed to AI */
  tools?: AppToolDefinition[];

  /** UI generator function */
  ui: (ctx: AppContext) => UITree;

  /** Lifecycle hooks */
  onActivate?: (ctx: AppContext) => Promise<void> | void;
  onDeactivate?: (ctx: AppContext) => Promise<void> | void;
  onReload?: (ctx: AppContext, previousState: Record<string, unknown>) => Promise<void> | void;

  /** Services configuration */
  services?: Array<{
    name: string;
    start: (ctx: AppContext) => Promise<void> | void;
    stop: (ctx: AppContext) => Promise<void> | void;
  }>;
}

// ============================================================================
// App Runtime Types
// ============================================================================

/**
 * Trust level for security model
 */
export type TrustLevel = "development" | "installed" | "untrusted";

/**
 * App status in the runtime
 */
export type AppStatus =
  | "discovered"
  | "loading"
  | "ready"
  | "active"
  | "error"
  | "unloading";

/**
 * Managed app instance
 */
export interface ManagedApp {
  /** Unique ID (derived from path) */
  id: string;
  /** Absolute path to app directory */
  path: string;
  /** Parsed manifest */
  manifest: AppManifest;
  /** Current status */
  status: AppStatus;
  /** Trust level */
  trustLevel: TrustLevel;
  /** Error if status is 'error' */
  error?: AppError;
  /** Project ID this app belongs to */
  projectId: string;
}

/**
 * App error information
 */
export interface AppError {
  category: "manifest" | "server_load" | "ui_generation" | "action" | "service";
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  recoverable: boolean;
}

// ============================================================================
// SDR Protocol Messages
// ============================================================================

/**
 * SDR message types for client-server communication
 */
export type SDRMessageType =
  | "ui:sync" // Full UI tree sync
  | "ui:patch" // Partial update (future optimization)
  | "state:sync" // Full state sync
  | "state:update" // Single state update
  | "action:call" // User action from client
  | "action:result" // Action result
  | "app:ready" // App initialized
  | "app:reload" // Hot reload triggered
  | "app:error"; // App error

/**
 * SDR message envelope
 */
export interface SDRMessage {
  id: string;
  type: SDRMessageType;
  payload: unknown;
  timestamp: number;
  correlationId?: string;
}

/**
 * UI sync payload
 */
export interface UISyncPayload {
  tree: UITree;
  state: Record<string, unknown>;
}

/**
 * Action call payload (from client)
 */
export interface ActionCallPayload {
  action: string;
  args?: unknown;
}

/**
 * App error payload
 */
export interface AppErrorPayload {
  category: AppError["category"];
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  recoverable: boolean;
}

// ============================================================================
// Discovered App (before loading)
// ============================================================================

export interface DiscoveredApp {
  /** Path to app directory */
  path: string;
  /** Parsed manifest */
  manifest: AppManifest;
  /** Trust level based on source */
  trustLevel: TrustLevel;
}
