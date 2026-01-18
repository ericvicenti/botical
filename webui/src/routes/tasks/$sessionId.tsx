import { createFileRoute } from "@tanstack/react-router";
import { TaskChat } from "@/components/tasks/TaskChat";
import { useUI } from "@/contexts/ui";

export const Route = createFileRoute("/tasks/$sessionId")({
  component: TaskView,
});

function TaskView() {
  const { sessionId } = Route.useParams();
  const { selectedProjectId } = useUI();

  if (!selectedProjectId) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        No project selected
      </div>
    );
  }

  return <TaskChat sessionId={sessionId} projectId={selectedProjectId} />;
}
