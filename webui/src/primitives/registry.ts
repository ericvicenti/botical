import { z } from "zod";
import type {
  ActionDefinition,
  PageDefinition,
  PageCategory,
  PageSize,
  ActionContext,
  ActionResult,
} from "./types";

// ============================================================================
// Page Registry
// ============================================================================

const pageRegistry = new Map<string, PageDefinition>();

/**
 * Define and register a page
 */
export function definePage<
  TParams extends z.ZodTypeAny,
  TSearch extends z.ZodTypeAny = z.ZodTypeAny
>(page: PageDefinition<TParams, TSearch>): PageDefinition<TParams, TSearch> {
  pageRegistry.set(page.id, page as unknown as PageDefinition);
  return page;
}

/**
 * Get a page by ID
 */
export function getPage(id: string): PageDefinition | undefined {
  return pageRegistry.get(id);
}

/**
 * Get all registered pages
 */
export function getAllPages(): PageDefinition[] {
  return Array.from(pageRegistry.values());
}

/**
 * Get pages filtered by category
 */
export function getPagesByCategory(category: PageCategory): PageDefinition[] {
  return Array.from(pageRegistry.values()).filter(
    (page) => page.category === category
  );
}

/**
 * Get pages filtered by size
 */
export function getPagesBySize(size: PageSize): PageDefinition[] {
  return Array.from(pageRegistry.values()).filter(
    (page) => (page.size ?? "full") === size
  );
}

/**
 * Get all sidebar pages (size: "sidebar")
 */
export function getSidebarPages(): PageDefinition[] {
  return getPagesBySize("sidebar");
}

/**
 * Match a URL pathname to a page, optionally parsing search params
 */
export function matchPageRoute(
  pathname: string,
  searchParams?: URLSearchParams
): {
  page: PageDefinition;
  routeParams: Record<string, string>;
  parsedParams: Record<string, unknown> | null;
  parsedSearch: Record<string, unknown> | null;
} | null {
  for (const page of pageRegistry.values()) {
    const routeParams = matchRoute(page.route, pathname);
    if (routeParams) {
      // Parse path params
      const parsedParams = page.parseParams(routeParams);

      // Parse search params if the page supports them
      let parsedSearch: Record<string, unknown> | null = null;
      if (searchParams && page.parseSearchParams && page.searchParams) {
        const searchObj: Record<string, string | string[] | undefined> = {};
        for (const [key, value] of searchParams.entries()) {
          const existing = searchObj[key];
          if (existing === undefined) {
            searchObj[key] = value;
          } else if (Array.isArray(existing)) {
            existing.push(value);
          } else {
            searchObj[key] = [existing, value];
          }
        }
        parsedSearch = page.parseSearchParams(searchObj);
      }

      return { page, routeParams, parsedParams, parsedSearch };
    }
  }
  return null;
}

/**
 * Simple route matching (e.g., "/projects/$projectId/commits/$hash")
 */
function matchRoute(
  pattern: string,
  pathname: string
): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith("$")) {
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

/**
 * Generate a URL for a page with params and optional search params
 */
export function getPageUrl(
  pageId: string,
  params: Record<string, unknown>,
  search?: Record<string, unknown>
): string {
  const page = pageRegistry.get(pageId);
  if (!page) {
    throw new Error(`Page "${pageId}" not found`);
  }

  const routeParams = page.getRouteParams(params);
  let url = page.route;

  for (const [key, value] of Object.entries(routeParams)) {
    url = url.replace(`$${key}`, value);
  }

  // Add search params if provided and page supports them
  if (search && page.getSearchParams) {
    const searchParams = page.getSearchParams(search);
    const searchString = new URLSearchParams(searchParams).toString();
    if (searchString) {
      url += `?${searchString}`;
    }
  }

  return url;
}

// ============================================================================
// Action Registry
// ============================================================================

const actionRegistry = new Map<string, ActionDefinition>();

/**
 * Define and register an action
 */
export function defineAction<TParams extends z.ZodTypeAny>(
  action: ActionDefinition<TParams>
): ActionDefinition<TParams> {
  actionRegistry.set(action.id, action as unknown as ActionDefinition);
  return action;
}

/**
 * Get an action by ID
 */
export function getAction(id: string): ActionDefinition | undefined {
  return actionRegistry.get(id);
}

/**
 * Get all registered actions
 */
export function getAllActions(): ActionDefinition[] {
  return Array.from(actionRegistry.values());
}

/**
 * Execute an action by ID
 */
export async function executeAction(
  id: string,
  params: unknown,
  ctx: ActionContext
): Promise<ActionResult> {
  const action = actionRegistry.get(id);
  if (!action) {
    return { type: "error", message: `Action "${id}" not found` };
  }

  const parsed = action.params.safeParse(params);
  if (!parsed.success) {
    return {
      type: "error",
      message: `Invalid params: ${parsed.error.message}`,
    };
  }

  try {
    return await action.execute(parsed.data, ctx);
  } catch (error) {
    return {
      type: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
