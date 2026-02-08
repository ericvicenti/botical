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
export { useBoticalQuery, prefetchBoticalQuery } from "./useBoticalQuery";
export { useBoticalMutation } from "./useBoticalMutation";

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

// Session queries
export {
  sessionsListQuery,
  sessionsGetQuery,
  sessionsCountQuery,
  sessionsCreateMutation,
  sessionsUpdateMutation,
  sessionsDeleteMutation,
  type SessionQueryResult,
  type SessionsListParams,
  type SessionsGetParams,
  type SessionsCountParams,
  type SessionsCreateParams,
  type SessionsUpdateParams,
  type SessionsDeleteParams,
} from "./sessions";

// Message queries
export {
  messagesListQuery,
  messagesGetQuery,
  messagePartsListQuery,
  messagesCreateMutation,
  messagesDeleteMutation,
  type MessageQueryResult,
  type MessagePartQueryResult,
  type MessageWithPartsQueryResult,
  type MessagesListParams,
  type MessagesGetParams,
  type MessagePartsListParams,
  type MessagesCreateParams,
  type MessagesDeleteParams,
} from "./messages";

// Task queries
export {
  tasksListBySessionQuery,
  tasksListByMissionQuery,
  tasksGetQuery,
  tasksCountBySessionQuery,
  tasksCountByMissionQuery,
  tasksCreateMutation,
  tasksUpdateMutation,
  tasksDeleteMutation,
  tasksBatchReplaceMutation,
  type TaskQueryResult,
  type TaskStatus,
  type TaskActor,
  type TasksListBySessionParams,
  type TasksListByMissionParams,
  type TasksGetParams,
  type TasksCountBySessionParams,
  type TasksCountByMissionParams,
  type TasksCreateParams,
  type TasksUpdateParams,
  type TasksDeleteParams,
  type TasksBatchReplaceParams,
} from "./tasks";
