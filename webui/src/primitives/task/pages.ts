import { z } from "zod";
import { definePage } from "../registry";
import TaskChatPage from "./TaskChatPage";

/**
 * Page: Task Chat
 *
 * Shows a task/session chat interface.
 */
export const taskChatPage = definePage({
  id: "task.chat",
  icon: "message-square",
  category: "task",
  description: "View task chat session",

  getLabel: (params) => params.title || "Task",
  getTitle: (params) => params.title || "Task",

  params: z.object({
    sessionId: z.string(),
    projectId: z.string().optional(),
    title: z.string().optional(),
  }),

  route: "/projects/$projectId/tasks/$sessionId",

  parseParams: (routeParams) => ({
    sessionId: routeParams.sessionId,
    projectId: routeParams.projectId,
  }),

  getRouteParams: (params) => ({
    sessionId: params.sessionId,
    projectId: params.projectId || "",
  }),

  component: TaskChatPage,
});
