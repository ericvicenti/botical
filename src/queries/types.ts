/**
 * Query Primitive Type Definitions
 *
 * Core types for the unified query system that works on both
 * frontend and backend.
 */

import type { Database } from "bun:sqlite";

/**
 * Cache scope determines where the cache is stored
 */
export type CacheScope = "global" | "project" | "session";

/**
 * Cache configuration for a query
 */
export interface QueryCacheConfig<P> {
  /** Time-to-live in milliseconds. undefined = use default, Infinity = never expires */
  ttl?: number;
  /** Scope of the cache */
  scope?: CacheScope;
  /** Function to generate cache key from params */
  key?: (params: P) => string[];
}

/**
 * Real-time configuration for a query
 */
export interface QueryRealtimeConfig<T, P> {
  /** WebSocket event names that should invalidate this query */
  events?: string[];
  /** Custom subscription function for streaming data */
  subscribe?: (
    params: P,
    onData: (data: T) => void,
    onError: (error: Error) => void
  ) => () => void;
}

/**
 * Pagination configuration
 */
export interface QueryPaginationConfig {
  /** Default limit if not specified */
  defaultLimit: number;
  /** Maximum allowed limit */
  maxLimit: number;
}

/**
 * Context provided to query fetch functions on the backend
 */
export interface QueryContext {
  /** Project database connection (if in project scope) */
  db?: Database;
  /** Root database connection */
  rootDb?: Database;
  /** Project ID (if applicable) */
  projectId?: string;
  /** Request ID for tracing */
  requestId?: string;
}

/**
 * Context provided to mutation execute functions
 */
export interface MutationContext extends QueryContext {
  /** User ID performing the mutation */
  userId?: string;
}

/**
 * A Query definition
 */
export interface Query<T, P = void> {
  /** Unique name for this query */
  name: string;

  /** Function to fetch the data */
  fetch: (params: P, context: QueryContext) => Promise<T>;

  /** Cache configuration */
  cache?: QueryCacheConfig<P>;

  /** Real-time update configuration */
  realtime?: QueryRealtimeConfig<T, P>;

  /** Pagination configuration (if query supports pagination) */
  pagination?: QueryPaginationConfig;

  /** Description for documentation */
  description?: string;
}

/**
 * A Mutation definition
 *
 * TParams: The input parameters for the mutation
 * TResult: The result returned by the mutation (defaults to void)
 */
export interface Mutation<TParams, TResult = void> {
  /** Unique name for this mutation */
  name: string;

  /** Function to execute the mutation */
  execute: (params: TParams, context: MutationContext) => Promise<TResult>;

  /** Query names to invalidate after successful mutation */
  invalidates?: string[];

  /** Function to generate specific query keys to invalidate */
  invalidateKeys?: (params: TParams, result: TResult) => string[][];

  /** Description for documentation */
  description?: string;
}

/**
 * Query result with metadata
 */
export interface QueryResult<T> {
  data: T;
  /** When the data was fetched */
  fetchedAt: number;
  /** Whether the data is from cache */
  fromCache: boolean;
}

/**
 * Paginated query parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Paginated query result
 */
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Query state for frontend hooks
 */
export interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  isStale: boolean;
}

/**
 * Mutation state for frontend hooks
 */
export interface MutationState<TResult> {
  data: TResult | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  isSuccess: boolean;
}

/**
 * Options for useIrisQuery hook
 */
export interface UseQueryOptions {
  /** Whether the query should execute */
  enabled?: boolean;
  /** Override stale time for this instance */
  staleTime?: number;
  /** Refetch interval in ms (for polling) */
  refetchInterval?: number;
}

/**
 * Options for useIrisMutation hook
 */
export interface UseMutationOptions<TResult> {
  /** Called on successful mutation */
  onSuccess?: (result: TResult) => void;
  /** Called on mutation error */
  onError?: (error: Error) => void;
  /** Called after mutation completes (success or error) */
  onSettled?: () => void;
}

/**
 * Registry of all queries for type-safe access
 */
export interface QueryRegistry {
  [key: string]: Query<unknown, unknown>;
}

/**
 * Registry of all mutations for type-safe access
 */
export interface MutationRegistry {
  [key: string]: Mutation<unknown, unknown>;
}
