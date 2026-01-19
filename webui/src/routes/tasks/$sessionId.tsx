import { createFileRoute } from "@tanstack/react-router";
import { TaskChat } from "@/components/tasks/TaskChat";
import { useUI } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";

export const Route = createFileRoute("/tasks/$sessionId")({
  component: TaskView,
});

function TaskView() {
  const { sessionId } = Route.useParams();
  const { selectedProjectId } = useUI();
  const { activeTabId } = useTabs();

  // Check if this task's tab is active
  const isActive = activeTabId === `task:${sessionId}`;

  if (!selectedProjectId) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        No project selected
      </div>
    );
  }

  return <TaskChat sessionId={sessionId} projectId={selectedProjectId} isActive={isActive} />;
}
