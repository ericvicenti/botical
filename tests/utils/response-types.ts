/**
 * Common response type definitions for API tests
 *
 * These types match the standard API response format used by all routes.
 * Use type assertions when parsing response bodies:
 *
 * const body = (await response.json()) as ListResponse<Project>;
 */

/**
 * Standard list response with pagination metadata
 */
export interface ListResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Standard single item response
 */
export interface ItemResponse<T> {
  data: T;
}

/**
 * Standard error response
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Success response without data (e.g., DELETE operations)
 */
export interface SuccessResponse {
  success: boolean;
}

/**
 * Common entity types for test responses
 */
export interface ProjectResponse {
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

export interface SessionResponse {
  id: string;
  slug: string;
  parentId: string | null;
  title: string;
  status: "active" | "archived" | "deleted";
  agent: string;
  providerId: string | null;
  modelId: string | null;
  messageCount: number;
  totalCost: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  shareUrl: string | null;
  shareSecret: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MessageResponse {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export interface AgentResponse {
  id: string;
  name: string;
  description: string;
  systemPrompt: string | null;
  model: string | null;
  tools: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ToolResponse {
  id: string;
  name: string;
  description: string;
  type: "code" | "mcp" | "http";
  code: string | null;
  mcpServer: string | null;
  mcpTool: string | null;
  httpUrl: string | null;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | null;
  parametersSchema: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TodoResponse {
  id: string;
  sessionId: string;
  content: string;
  activeForm: string;
  status: "pending" | "in_progress" | "completed";
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface MemberResponse {
  projectId: string;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  permissions: Record<string, boolean> | null;
  joinedAt: number;
  invitedBy: string | null;
}

export interface MissionResponse {
  id: string;
  projectId: string;
  sessionId: string | null;
  title: string;
  status: "planning" | "pending" | "running" | "paused" | "completed" | "cancelled";
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

export interface TaskResponse {
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

export interface ProcessResponse {
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
  createdBy: string;
  createdAt: number;
  startedAt: number;
  endedAt: number | null;
}

export interface ProcessOutputResponse {
  id: number;
  processId: string;
  timestamp: number;
  data: string;
  stream: "stdout" | "stderr";
}
