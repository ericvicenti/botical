import { createFileRoute } from "@tanstack/react-router";
import { TaskChatPage } from "@/primitives/task";

export const Route = createFileRoute("/projects/$projectId/tasks/$sessionId")({
  component: TaskViewRoute,
});

function TaskViewRoute() {
  const { projectId, sessionId } = Route.useParams();
  return <TaskChatPage params={{ sessionId, projectId }} />;
}
