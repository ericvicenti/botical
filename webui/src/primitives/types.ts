import { z } from "zod";

/**
 * Iris Primitives - Core Types
 *
 * Pages and Actions provide a unified interface for GUI, Agent, and Testing.
 */

// ============================================================================
// Page Primitive - The core UI surface
// ============================================================================

/**
 * Page definition - an addressable UI surface with typed parameters
 */
export interface PageDefinition<TParams extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Unique identifier (e.g., "git.commit-view") */
  id: string;

  /** Icon name (lucide icon) */
  icon: string;

  /** Generate label from params */
  getLabel: (params: z.infer<TParams>) => string;

  /** Zod schema for page parameters */
  params: TParams;

  /** Route path pattern (e.g., "/projects/$projectId/commits/$hash") */
  route: string;

  /** Parse route params to page params */
  parseParams: (routeParams: Record<string, string>) => z.infer<TParams> | null;

  /** Generate route params from page params */
  getRouteParams: (params: z.infer<TParams>) => Record<string, string>;

  /** React component for rendering */
  component: React.ComponentType<{ params: z.infer<TParams> }>;
}

// ============================================================================
// Action Primitive - Operations that can be triggered
// ============================================================================

/**
 * Action result types
 */
export type ActionResult =
  | { type: "success"; message?: string }
  | { type: "error"; message: string }
  | { type: "navigate"; pageId: string; params: Record<string, unknown> };

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
 * Action definition - an operation that can be executed
 */
export interface ActionDefinition<TParams extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Unique identifier (e.g., "git.create-commit") */
  id: string;

  /** Display label */
  label: string;

  /** Optional description */
  description?: string;

  /** Zod schema for parameters */
  params: TParams;

  /** Execute the action */
  execute: (
    params: z.infer<TParams>,
    ctx: ActionContext
  ) => Promise<ActionResult>;
}

// ============================================================================
// Registry Interface
// ============================================================================

export interface PageRegistry {
  pages: Map<string, PageDefinition>;
  register: <T extends z.ZodTypeAny>(page: PageDefinition<T>) => void;
  get: (id: string) => PageDefinition | undefined;
  matchRoute: (pathname: string) => { page: PageDefinition; params: Record<string, string> } | null;
  getUrl: (pageId: string, params: Record<string, unknown>) => string;
}
