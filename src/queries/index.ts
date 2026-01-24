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

// Project queries
export {
  projectsListQuery,
  projectsGetQuery,
  projectsCountQuery,
  projectsCreateMutation,
  projectsUpdateMutation,
  projectsDeleteMutation,
  type ProjectQueryResult,
  type ProjectsListParams,
  type ProjectsGetParams,
  type ProjectsCountParams,
  type ProjectsCreateParams,
  type ProjectsUpdateParams,
  type ProjectsDeleteParams,
} from "./projects.ts";

// Workflow queries
export {
  workflowsListQuery,
  workflowsGetQuery,
  workflowsCountQuery,
  workflowsCreateMutation,
  workflowsUpdateMutation,
  workflowsDeleteMutation,
  type WorkflowQueryResult,
  type WorkflowsListParams,
  type WorkflowsGetParams,
  type WorkflowsCountParams,
  type WorkflowsCreateParams,
  type WorkflowsUpdateParams,
  type WorkflowsDeleteParams,
} from "./workflows.ts";

// Service queries
export {
  servicesListQuery,
  servicesGetQuery,
  servicesCountQuery,
  servicesCreateMutation,
  servicesUpdateMutation,
  servicesDeleteMutation,
  type ServiceQueryResult,
  type ServicesListParams,
  type ServicesGetParams,
  type ServicesCountParams,
  type ServicesCreateParams,
  type ServicesUpdateParams,
  type ServicesDeleteParams,
} from "./services.ts";
