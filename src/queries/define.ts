/**
 * Query and Mutation Definition Helpers
 *
 * Factory functions for creating type-safe query and mutation definitions.
 */

import type { Query, Mutation, QueryCacheConfig } from "./types.ts";

/**
 * Default cache configuration
 */
const DEFAULT_CACHE_CONFIG: QueryCacheConfig<unknown> = {
  ttl: 60_000, // 1 minute default
  scope: "global",
};

/**
 * Query name validation regex: lowercase with dots for namespacing
 */
const QUERY_NAME_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;

/**
 * Validates a query name
 */
function validateQueryName(name: string): void {
  if (!QUERY_NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid query name "${name}". Must be lowercase with dots for namespacing (e.g., "projects.list")`
    );
  }
}

/**
 * Define a query with type safety and defaults
 */
export function defineQuery<T, P = void>(
  definition: Query<T, P>
): Query<T, P> {
  validateQueryName(definition.name);

  // Apply default cache config
  const cache = definition.cache
    ? { ...DEFAULT_CACHE_CONFIG, ...definition.cache }
    : undefined;

  // Generate default key function if not provided
  const keyFn = cache?.key ?? ((params: P) => {
    const baseKey = [definition.name];
    if (params && typeof params === "object") {
      // Add relevant params to key
      const paramKeys = Object.entries(params as Record<string, unknown>)
        .filter(([_, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${String(v)}`);
      return [...baseKey, ...paramKeys];
    }
    return baseKey;
  });

  return {
    ...definition,
    cache: cache ? { ...cache, key: keyFn } : undefined,
  };
}

/**
 * Define a mutation with type safety
 */
export function defineMutation<TParams, TResult = void>(
  definition: Mutation<TParams, TResult>
): Mutation<TParams, TResult> {
  validateQueryName(definition.name);

  return definition;
}

/**
 * Create a cache key from a query and params
 */
export function createCacheKey<T, P>(
  query: Query<T, P>,
  params: P
): string[] {
  if (query.cache?.key) {
    return query.cache.key(params);
  }
  return [query.name];
}

/**
 * Get the TTL for a query
 */
export function getQueryTTL<T, P>(query: Query<T, P>): number {
  return query.cache?.ttl ?? DEFAULT_CACHE_CONFIG.ttl ?? 60_000;
}

/**
 * Check if a query result is stale
 */
export function isQueryStale<T, P>(
  query: Query<T, P>,
  fetchedAt: number
): boolean {
  const ttl = getQueryTTL(query);
  if (ttl === Infinity) {
    return false;
  }
  return Date.now() - fetchedAt > ttl;
}
