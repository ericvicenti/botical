/**
 * Query and Mutation Executor
 *
 * Backend execution engine for queries and mutations.
 */

import type {
  Query,
  Mutation,
  QueryContext,
  MutationContext,
  QueryResult,
} from "./types.ts";
import { createCacheKey, getQueryTTL } from "./define.ts";
import { getGlobalCache, type QueryCache } from "./cache.ts";

/**
 * Options for query execution
 */
export interface ExecuteQueryOptions {
  /** Skip cache and fetch fresh data */
  skipCache?: boolean;
  /** Custom cache instance */
  cache?: QueryCache;
}

/**
 * Execute a query
 */
export async function executeQuery<T, P>(
  query: Query<T, P>,
  params: P,
  context: QueryContext,
  options: ExecuteQueryOptions = {}
): Promise<QueryResult<T>> {
  const cache = options.cache ?? getGlobalCache();
  const cacheKey = createCacheKey(query, params);
  const ttl = getQueryTTL(query);

  // Check cache first (unless skipping)
  if (!options.skipCache && query.cache) {
    const cached = cache.get<T>(cacheKey);
    if (cached && !cache.isStale(cached)) {
      return {
        data: cached.data,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
      };
    }
  }

  // Execute the query
  const data = await query.fetch(params, context);
  const fetchedAt = Date.now();

  // Store in cache if caching is enabled
  if (query.cache) {
    cache.set(cacheKey, data, ttl);
  }

  return {
    data,
    fetchedAt,
    fromCache: false,
  };
}

/**
 * Options for mutation execution
 */
export interface ExecuteMutationOptions {
  /** Custom cache instance for invalidation */
  cache?: QueryCache;
}

/**
 * Execute a mutation
 */
export async function executeMutation<TParams, TResult>(
  mutation: Mutation<TParams, TResult>,
  params: TParams,
  context: MutationContext,
  options: ExecuteMutationOptions = {}
): Promise<TResult> {
  const cache = options.cache ?? getGlobalCache();

  // Execute the mutation
  const result = await mutation.execute(params, context);

  // Invalidate related queries by name
  if (mutation.invalidates) {
    for (const queryName of mutation.invalidates) {
      // Invalidate all entries for this query
      cache.invalidatePrefix([queryName]);
    }
  }

  // Invalidate specific keys if provided
  if (mutation.invalidateKeys) {
    const keys = mutation.invalidateKeys(params, result);
    for (const key of keys) {
      cache.delete(key);
    }
  }

  return result;
}

/**
 * Invalidate a query by name
 */
export function invalidateQuery(
  queryName: string,
  cache?: QueryCache
): number {
  const c = cache ?? getGlobalCache();
  return c.invalidatePrefix([queryName]);
}

/**
 * Invalidate a query with specific params
 */
export function invalidateQueryWithParams<T, P>(
  query: Query<T, P>,
  params: P,
  cache?: QueryCache
): boolean {
  const c = cache ?? getGlobalCache();
  const key = createCacheKey(query, params);
  return c.delete(key);
}

/**
 * Prefetch a query (execute and cache without returning)
 */
export async function prefetchQuery<T, P>(
  query: Query<T, P>,
  params: P,
  context: QueryContext,
  cache?: QueryCache
): Promise<void> {
  await executeQuery(query, params, context, { cache });
}
