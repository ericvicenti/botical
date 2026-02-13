import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TaskChatPage } from "@/primitives/task";

const taskSearchSchema = z.object({
  initialMessage: z.string().optional(),
});

export const Route = createFileRoute("/projects/$projectId/tasks/$sessionId")({
  component: TaskViewRoute,
  validateSearch: taskSearchSchema,
});

function TaskViewRoute() {
  const { projectId, sessionId } = Route.useParams();
  const { initialMessage } = Route.useSearch();
  return <TaskChatPage params={{ sessionId, projectId, initialMessage }} />;
}
