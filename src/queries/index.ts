/**
 * Query Primitive
 *
 * Unified data fetching abstraction for Botical.
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
} from "./sessions.ts";

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
} from "./messages.ts";

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
  type TasksListBySessionParams,
  type TasksListByMissionParams,
  type TasksGetParams,
  type TasksCountBySessionParams,
  type TasksCountByMissionParams,
  type TasksCreateParams,
  type TasksUpdateParams,
  type TasksDeleteParams,
  type TasksBatchReplaceParams,
} from "./tasks.ts";

// File queries
export {
  filesListQuery,
  filesGetQuery,
  filesGetByPathQuery,
  filesReadQuery,
  filesCountQuery,
  fileVersionsListQuery,
  fileVersionGetQuery,
  fileVersionContentQuery,
  fileDiffQuery,
  filesWriteMutation,
  filesDeleteMutation,
  filesRevertMutation,
  type FileQueryResult,
  type FileWithContentQueryResult,
  type FileVersionQueryResult,
  type FileDiffResult,
  type FilesListParams,
  type FilesGetParams,
  type FilesGetByPathParams,
  type FilesReadParams,
  type FilesCountParams,
  type FileVersionsListParams,
  type FileVersionGetParams,
  type FileVersionContentParams,
  type FileDiffParams,
  type FilesWriteParams,
  type FilesDeleteParams,
  type FilesRevertParams,
} from "./files.ts";

// Git operation queries
export {
  gitStatusQuery,
  gitBranchesQuery,
  gitLogQuery,
  gitCommitGetQuery,
  gitDiffQuery,
  gitCommitDiffQuery,
  gitCommitFileDiffQuery,
  gitShowFileQuery,
  gitListTreeQuery,
  gitRemotesQuery,
  gitSyncStatusQuery,
  gitCheckoutMutation,
  gitCreateBranchMutation,
  gitDeleteBranchMutation,
  gitCommitMutation,
  gitFetchMutation,
  gitPullMutation,
  gitPushMutation,
  gitAddRemoteMutation,
  gitInitMutation,
  gitDiscardMutation,
  gitDiscardAllMutation,
  gitRebaseMutation,
  gitAbortRebaseMutation,
  gitSyncMutation,
  type GitStatus,
  type BranchInfo,
  type CommitInfo,
  type GitSyncStatus,
  type FileChange,
  type RemoteInfoResult,
  type GitStatusParams,
  type GitBranchesParams,
  type GitLogParams,
  type GitCommitGetParams,
  type GitDiffParams,
  type GitCommitDiffParams,
  type GitCommitFileDiffParams,
  type GitShowFileParams,
  type GitListTreeParams,
  type GitRemotesParams,
  type GitSyncStatusParams,
  type GitCheckoutParams,
  type GitCreateBranchParams,
  type GitDeleteBranchParams,
  type GitCommitParams,
  type GitFetchParams,
  type GitPullParams,
  type GitPushParams,
  type GitAddRemoteParams,
  type GitInitParams,
  type GitDiscardParams,
  type GitDiscardAllParams,
  type GitRebaseParams,
  type GitAbortRebaseParams,
  type GitSyncParams,
} from "./git-operations.ts";

// Process queries
export {
  processesListQuery,
  processesGetQuery,
  processesCountQuery,
  processesListRunningQuery,
  processOutputQuery,
  processOutputTextQuery,
  processesSpawnMutation,
  processesKillMutation,
  processesWriteMutation,
  processesResizeMutation,
  processesDeleteMutation,
  processesTrimOutputMutation,
  processesKillByScopeMutation,
  type ProcessQueryResult,
  type ProcessOutputQueryResult,
  type ProcessesListParams,
  type ProcessesGetParams,
  type ProcessesCountParams,
  type ProcessesListRunningParams,
  type ProcessOutputParams,
  type ProcessOutputTextParams,
  type ProcessesSpawnParams,
  type ProcessesKillParams,
  type ProcessesWriteParams,
  type ProcessesResizeParams,
  type ProcessesDeleteParams,
  type ProcessesTrimOutputParams,
  type ProcessesKillByScopeParams,
} from "./processes.ts";

// Mission queries
export {
  missionsListQuery,
  missionsGetQuery,
  missionsCountQuery,
  missionsActiveQuery,
  missionsCreateMutation,
  missionsApprovePlanMutation,
  missionsStartMutation,
  missionsPauseMutation,
  missionsResumeMutation,
  missionsCompleteMutation,
  missionsCancelMutation,
  missionsDeleteMutation,
  missionsUpdateTitleMutation,
  type MissionQueryResult,
  type MissionWithPlanResult,
  type MissionsListParams,
  type MissionsGetParams,
  type MissionsCountParams,
  type MissionsActiveParams,
  type MissionsCreateParams,
  type MissionsApprovePlanParams,
  type MissionsStartParams,
  type MissionsPauseParams,
  type MissionsResumeParams,
  type MissionsCompleteParams,
  type MissionsCancelParams,
  type MissionsDeleteParams,
  type MissionsUpdateTitleParams,
} from "./missions.ts";
