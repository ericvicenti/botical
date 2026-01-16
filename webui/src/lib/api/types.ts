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
  content: string;
  createdAt: number;
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
  createdBy: string;
  createdAt: number;
  startedAt: number;
  endedAt: number | null;
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
