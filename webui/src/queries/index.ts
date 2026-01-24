/**
 * Query Primitive - Frontend
 *
 * Unified data fetching hooks for React components.
 */

// Types
export type {
  Query,
  Mutation,
  QueryState,
  MutationState,
  QueryCacheConfig,
  QueryRealtimeConfig,
  QueryPaginationConfig,
  UseQueryOptions,
  UseMutationOptions,
  CacheScope,
  QueryContextValue,
} from "./types";

// Provider
export {
  QueryProvider,
  useQueryContext,
  useQueryDefinition,
  useMutationDefinition,
  type QueryProviderProps,
} from "./QueryProvider";

// Hooks
export { useIrisQuery, prefetchIrisQuery } from "./useIrisQuery";
export { useIrisMutation } from "./useIrisMutation";
