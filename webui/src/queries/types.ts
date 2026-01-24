/**
 * Query Primitive Types for Frontend
 *
 * These types mirror the backend types but are optimized for frontend use.
 */

/**
 * Cache scope determines where the cache is stored
 */
export type CacheScope = "global" | "project" | "session";

/**
 * Cache configuration for a query
 */
export interface QueryCacheConfig<P> {
  /** Time-to-live in milliseconds */
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
  defaultLimit: number;
  maxLimit: number;
}

/**
 * A Query definition (frontend version)
 */
export interface Query<T, P = void> {
  /** Unique name for this query */
  name: string;

  /** API endpoint path (relative to /api) */
  endpoint: string | ((params: P) => string);

  /** HTTP method (defaults to GET) */
  method?: "GET" | "POST";

  /** Transform params to query string or body */
  params?: (params: P) => Record<string, unknown>;

  /** Cache configuration */
  cache?: QueryCacheConfig<P>;

  /** Real-time update configuration */
  realtime?: QueryRealtimeConfig<T, P>;

  /** Pagination configuration */
  pagination?: QueryPaginationConfig;

  /** Description for documentation */
  description?: string;
}

/**
 * A Mutation definition (frontend version)
 */
export interface Mutation<TParams, TResult = void> {
  /** Unique name for this mutation */
  name: string;

  /** API endpoint path */
  endpoint: string | ((params: TParams) => string);

  /** HTTP method (defaults to POST) */
  method?: "POST" | "PUT" | "DELETE" | "PATCH";

  /** Transform params to request body */
  body?: (params: TParams) => unknown;

  /** Queries to invalidate after successful mutation (by name) */
  invalidates?: string[];

  /** Function to generate specific query keys to invalidate */
  invalidateKeys?: (params: TParams, result: TResult) => string[][];

  /** Description for documentation */
  description?: string;
}

/**
 * Query state returned by useIrisQuery
 */
export interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  isStale: boolean;
  refetch: () => Promise<void>;
}

/**
 * Mutation state returned by useIrisMutation
 */
export interface MutationState<TParams, TResult> {
  mutate: (params: TParams) => void;
  mutateAsync: (params: TParams) => Promise<TResult>;
  data: TResult | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  isSuccess: boolean;
  reset: () => void;
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
  /** Called after mutation completes */
  onSettled?: () => void;
}

/**
 * Query context for provider
 */
export interface QueryContextValue {
  /** Override queries for testing */
  queryOverrides?: Record<string, Query<unknown, unknown>>;
  /** Override mutations for testing */
  mutationOverrides?: Record<string, Mutation<unknown, unknown>>;
}
