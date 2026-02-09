export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  type: "local" | "remote";
  path: string | null;
  gitRemote: string | null;
  iconUrl: string | null;
  color: string | null;
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface Session {
  id: string;
  slug: string;
  parentId: string | null;
  title: string;
  status: "active" | "archived" | "deleted";
  agent: string;
  providerId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  messageCount: number;
  totalCost: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  shareUrl: string | null;
  shareSecret: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  parentId: string | null;
  providerId: string | null;
  modelId: string | null;
  agent: string | null;
  finishReason: string | null;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: number;
  completedAt: number | null;
  parts?: MessagePart[];
}

export interface MessagePart {
  id: string;
  messageId: string;
  sessionId: string;
  type: "text" | "reasoning" | "tool-call" | "tool-result" | "file" | "step-start" | "step-finish";
  content: unknown;
  toolName: string | null;
  toolCallId: string | null;
  toolStatus: "pending" | "running" | "completed" | "error" | null;
  createdAt: number;
  updatedAt: number;
}

export interface MessageWithParts extends Message {
  parts: MessagePart[];
}

export interface Mission {
  id: string;
  projectId: string;
  sessionId: string | null;
  title: string;
  status:
    | "planning"
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "cancelled";
  planPath: string;
  planApprovedAt: number | null;
  planApprovedBy: string | null;
  createdAt: number;
  startedAt: number | null;
  pausedAt: number | null;
  completedAt: number | null;
  summary: string | null;
  completionCriteriaMet: boolean;
}

export interface Task {
  id: string;
  sessionId: string;
  missionId: string | null;
  title: string;
  activeForm: string;
  status: "pending" | "in_progress" | "completed" | "blocked" | "cancelled";
  position: number;
  createdBy: "agent" | "user";
  assignedTo: "agent" | "user";
  parentTaskId: string | null;
  description: string | null;
  result: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface Process {
  id: string;
  projectId: string;
  type: "command" | "service";
  command: string;
  cwd: string;
  env: Record<string, string> | null;
  cols: number;
  rows: number;
  scope: "task" | "mission" | "project";
  scopeId: string;
  status: "starting" | "running" | "completed" | "failed" | "killed";
  exitCode: number | null;
  label: string | null;
  serviceId: string | null;
  logPath: string | null;
  createdBy: string;
  createdAt: number;
  startedAt: number;
  endedAt: number | null;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  command: string;
  cwd: string | null;
  env: Record<string, string> | null;
  autoStart: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  isRunning: boolean;
  runningProcessId: string | null;
}

export interface DetailedFileEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modified: number;
  created: number;
  accessed: number;
  mode: number;
  permissions: string;
  isHidden: boolean;
}

export interface FolderDetails {
  path: string;
  name: string;
  totalSize: number;
  fileCount: number;
  folderCount: number;
  entries: DetailedFileEntry[];
}

export interface ListResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ItemResponse<T> {
  data: T;
}

// Git types

export type FileStatus = "M" | "A" | "D" | "R" | "?" | "C";

export interface FileChange {
  path: string;
  status: FileStatus;
  oldPath?: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: FileChange[];
  isRepo: boolean;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  remote?: string;
}

export interface CommitInfo {
  hash: string;
  hashShort: string;
  message: string;
  body?: string;
  author: string;
  email: string;
  date: number;
  files?: FileChange[];
}

export interface CommitResult {
  hash: string;
  message: string;
  summary: {
    changes: number;
    insertions: number;
    deletions: number;
  };
}

export interface CloneResult {
  path: string;
  name: string;
  branch: string;
}

export type SyncState =
  | "idle"
  | "fetching"
  | "pushing"
  | "rebasing"
  | "conflict"
  | "error";

export interface GitSyncStatus {
  state: SyncState;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  hasUpstream: boolean;
  error?: string;
  conflictedFiles?: string[];
  lastSyncTime?: number;
}

// Tool types

export type ToolCategory = "filesystem" | "execution" | "search" | "agent" | "action" | "other";

export interface CoreTool {
  name: string;
  description: string;
  category: ToolCategory;
  requiresCodeExecution: boolean;
}

// Skill types

export interface Skill {
  name: string;
  description: string;
  path: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
}

export interface SkillResource {
  path: string;
  type: "script" | "reference" | "asset";
}

export interface SkillDetails extends Skill {
  instructions: string;
  resources: SkillResource[];
}

export interface InstalledSkill {
  repo: string;
  ref?: string;
  installedAt: number;
  enabled: boolean;
  path: string;
  skills: Skill[];
}

export interface SkillInstallRequest {
  repo: string;
  ref?: string;
}

export interface SkillInstallResult {
  repo: string;
  ref?: string;
  skills: Skill[];
}

// Backend Action types (from /api/actions)

export interface BackendActionParam {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  required: boolean;
  description?: string;
  options?: string[];
}

export interface BackendAction {
  id: string;
  label: string;
  description?: string;
  category: string;
  icon?: string;
  params: BackendActionParam[];
}

// Task Template types

export interface TaskTemplateSummary {
  id: string;
  name: string;
  description?: string;
  agentClass: string;
}

export interface TaskTemplate extends TaskTemplateSummary {
  systemPrompt: string;
  tools?: string[];
  filePath: string;
}

// Workflow types

export interface WorkflowInputField {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
}

export interface Workflow {
  id: string;
  name: string;
  label: string;
  description: string;
  category: string;
  icon?: string;
  inputSchema: {
    fields: WorkflowInputField[];
  };
  steps: unknown[];
}

// Extension types

export interface ExtensionSidebarConfig {
  id: string;
  label: string;
  icon: string;
}

export interface ExtensionFrontendConfig {
  sidebar?: ExtensionSidebarConfig;
  routes?: string[];
}

export interface Extension {
  id: string;
  name: string;
  description: string;
  version: string;
  icon: string;
  category?: string;
  frontend?: ExtensionFrontendConfig;
  status: "starting" | "running" | "stopped" | "error";
  port?: number;
}

export interface ProjectExtensions {
  enabled: string[];
}

// Schedule types

export type ScheduleActionType = "action" | "workflow";
export type ScheduleRunStatus = "pending" | "running" | "success" | "failed" | "timeout";

export interface ActionConfig {
  actionId: string;
  actionParams?: Record<string, unknown>;
}

export interface WorkflowConfig {
  workflowId: string;
  workflowInput?: Record<string, unknown>;
}

export interface Schedule {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  actionType: ScheduleActionType;
  actionConfig: ActionConfig | WorkflowConfig;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastRunStatus: ScheduleRunStatus | null;
  lastRunError: string | null;
  maxRuntimeMs: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  projectId: string;
  status: ScheduleRunStatus;
  sessionId: string | null;
  scheduledFor: number;
  startedAt: number | null;
  completedAt: number | null;
  output: string | null;
  error: string | null;
}
