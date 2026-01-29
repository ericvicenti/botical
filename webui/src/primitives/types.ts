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
 * Page categories for organization and extension discovery
 */
export type PageCategory =
  | "home"
  | "project"
  | "git"
  | "file"
  | "process"
  | "workflow"
  | "task"
  | "settings"
  | "docker"
  | "other";

/**
 * Page size determines where/how the page renders
 * - sidebar: Narrow panel for sidebar (240-300px)
 * - medium: Medium width panel (400-600px)
 * - full: Full main content area
 * - modal-sm/md/lg: Modal dialogs of various sizes
 */
export type PageSize =
  | "sidebar"
  | "medium"
  | "full"
  | "modal-sm"
  | "modal-md"
  | "modal-lg";

/**
 * Page definition - an addressable UI surface with typed parameters
 *
 * @template TParams - Zod schema for path parameters
 * @template TSearch - Zod schema for search/query parameters (defaults to empty object)
 */
export interface PageDefinition<
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
  TSearch extends z.ZodTypeAny = z.ZodTypeAny
> {
  /** Unique identifier (e.g., "git.commit-view") */
  id: string;

  /** Icon name (lucide icon) */
  icon: string;

  /**
   * Page size - determines rendering location
   * Defaults to "full" if not specified
   */
  size?: PageSize;

  /** Generate label from params (used for tabs) */
  getLabel: (params: z.infer<TParams>, search?: unknown) => string;

  /** Zod schema for path parameters */
  params: TParams;

  /** Route path pattern (e.g., "/projects/$projectId/commits/$hash") */
  route: string;

  /** Parse route params to page params */
  parseParams: (routeParams: Record<string, string>) => z.infer<TParams> | null;

  /** Generate route params from page params */
  getRouteParams: (params: z.infer<TParams>) => Record<string, string>;

  /** React component for rendering */
  component: React.ComponentType<{
    params: z.infer<TParams>;
    search?: unknown;
  }>;

  // ---- New fields for enhanced functionality ----

  /** Optional description for extension discovery */
  description?: string;

  /** Category for organization in extension UI */
  category?: PageCategory;

  /** Generate document title (defaults to getLabel if not provided) */
  getTitle?: (params: z.infer<TParams>, search?: unknown) => string;

  /** Zod schema for search/query parameters */
  searchParams?: TSearch;

  /** Parse URL search params to typed search object */
  parseSearchParams?: (
    search: Record<string, string | string[] | undefined>
  ) => z.infer<TSearch>;

  /** Generate URL search params from typed search object */
  getSearchParams?: (search: unknown) => Record<string, string>;
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
