/**
 * Query Primitive
 *
 * Unified data fetching abstraction for Iris.
 */

// Types
export type {
  Query,
  Mutation,
  QueryContext,
  MutationContext,
  QueryResult,
  QueryState,
  MutationState,
  QueryCacheConfig,
  QueryRealtimeConfig,
  QueryPaginationConfig,
  PaginationParams,
  PaginatedResult,
  UseQueryOptions,
  UseMutationOptions,
  CacheScope,
  QueryRegistry,
  MutationRegistry,
} from "./types.ts";

// Definition helpers
export {
  defineQuery,
  defineMutation,
  createCacheKey,
  getQueryTTL,
  isQueryStale,
} from "./define.ts";

// Cache
export {
  QueryCache,
  getGlobalCache,
  resetGlobalCache,
  type CacheEntry,
} from "./cache.ts";

// Executor
export {
  executeQuery,
  executeMutation,
  invalidateQuery,
  invalidateQueryWithParams,
  prefetchQuery,
  type ExecuteQueryOptions,
  type ExecuteMutationOptions,
} from "./executor.ts";

// ============================================
// Query Definitions
// ============================================

// Agent queries
export {
  agentsListQuery,
  agentsGetQuery,
  type AgentQueryResult,
  type AgentsListParams,
  type AgentsGetParams,
} from "./agents.ts";

// Tool queries
export {
  toolsCoreQuery,
  toolsActionsQuery,
  type CoreTool,
  type BackendAction,
} from "./tools.ts";

// Git queries
export {
  gitIdentityQuery,
  type GitIdentity,
} from "./git.ts";
