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
} from "./agents";

// Tool queries
export {
  toolsCoreQuery,
  toolsActionsQuery,
  type CoreTool,
  type BackendAction,
} from "./tools";

// Git queries
export { gitIdentityQuery, type GitIdentity } from "./git";

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
} from "./projects";

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
} from "./workflows";

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
} from "./services";
