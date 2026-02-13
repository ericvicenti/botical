import { TaskChat } from "@/components/tasks/TaskChat";
import { useTabs } from "@/contexts/tabs";

interface TaskChatPageProps {
  params: {
    sessionId: string;
    projectId?: string;
    title?: string;
    initialMessage?: string;
  };
}

export default function TaskChatPage({ params }: TaskChatPageProps) {
  const { sessionId, projectId } = params;
  const { activeTabId } = useTabs();
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
