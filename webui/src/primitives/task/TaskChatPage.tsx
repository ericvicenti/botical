import { TaskChat } from "@/components/tasks/TaskChat";
import { useUI } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";

interface TaskChatPageProps {
  params: {
    sessionId: string;
    projectId?: string;
    title?: string;
  };
}

export default function TaskChatPage({ params }: TaskChatPageProps) {
  const { sessionId, projectId: paramProjectId } = params;
  const { selectedProjectId } = useUI();
  const { activeTabId } = useTabs();

  // Use projectId from params if available, otherwise fall back to selected project
  const projectId = paramProjectId || selectedProjectId;

  // Check if this task's tab is active
  const isActive = activeTabId === `task:${sessionId}`;

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        No project selected
      </div>
    );
  }

  return <TaskChat sessionId={sessionId} projectId={projectId} isActive={isActive} />;
}
