import { z } from "zod";

/**
 * Iris Primitives - Core Types
 *
 * These primitives provide a unified interface for GUI, Agent, and Testing.
 */

// ============================================================================
// Action Primitive
// ============================================================================

/**
 * Action result types - what an action can return
 */
export type ActionResult =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | { type: "page"; pageId: string; params: Record<string, unknown> };

/**
 * Context passed to action execute functions
 */
export interface ActionContext {
  /** Which surface triggered the action */
  surface: "gui" | "agent" | "test";
  /** Project ID if in project scope */
  projectId?: string;
}

/**
 * Action definition - the core primitive for "doing something"
 */
export interface ActionDefinition<
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
  TResult extends ActionResult = ActionResult,
> {
  /** Unique identifier (e.g., "git.commit") */
  id: string;
  /** Display label for GUI */
  label: string;
  /** Optional description for documentation */
  description?: string;
  /** Zod schema for parameters */
  params: TParams;
  /** Execute the action */
  execute: (
    params: z.infer<TParams>,
    ctx: ActionContext
  ) => Promise<TResult>;
}

// ============================================================================
// Page Primitive
// ============================================================================

/**
 * Page definition - a long-lived, addressable UI surface
 */
export interface PageDefinition<
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
  TData = unknown,
> {
  /** Unique identifier (e.g., "git.commit-view") */
  id: string;
  /** Icon name for tab (lucide icon name) */
  icon: string;
  /** Generate label from params */
  label: (params: z.infer<TParams>) => string;
  /** Optional description */
  description?: string;
  /** Zod schema for page parameters */
  params: TParams;
  /** Route path pattern (e.g., "/projects/$projectId/commits/$hash") */
  route: string;
  /** Extract route params from page params */
  getRouteParams: (params: z.infer<TParams>) => Record<string, string>;
  /** Parse route params to page params */
  parseRouteParams: (routeParams: Record<string, string>) => z.infer<TParams>;
  /** Actions available on this page */
  actions?: string[];
  /** Fetch data for this page (optional - for programmatic access) */
  getData?: (params: z.infer<TParams>) => Promise<TData>;
  /** React component for rendering */
  component: React.ComponentType<{ params: z.infer<TParams> }>;
}

// ============================================================================
// Registry Types
// ============================================================================

export interface ActionRegistry {
  actions: Map<string, ActionDefinition>;
  register: <T extends z.ZodTypeAny>(action: ActionDefinition<T>) => void;
  get: (id: string) => ActionDefinition | undefined;
  execute: <T extends z.ZodTypeAny>(
    id: string,
    params: z.infer<T>,
    ctx: ActionContext
  ) => Promise<ActionResult>;
}

export interface PageRegistry {
  pages: Map<string, PageDefinition>;
  register: <T extends z.ZodTypeAny, D = unknown>(page: PageDefinition<T, D>) => void;
  get: (id: string) => PageDefinition | undefined;
  getByRoute: (pathname: string) => { page: PageDefinition; params: Record<string, string> } | null;
}
