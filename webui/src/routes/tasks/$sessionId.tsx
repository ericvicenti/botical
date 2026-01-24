import { createFileRoute } from "@tanstack/react-router";
import { TaskChatPage } from "@/primitives/task";

export const Route = createFileRoute("/tasks/$sessionId")({
  component: TaskViewRoute,
});

function TaskViewRoute() {
  const { sessionId } = Route.useParams();
  return <TaskChatPage params={{ sessionId }} />;
}
