import { useSessions } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";
import { cn } from "@/lib/utils/cn";
import { Plus, MessageSquare, MoreHorizontal } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { Session } from "@/lib/api/types";

interface TasksPanelProps {
  projectId: string;
}

export function TasksPanel({ projectId }: TasksPanelProps) {
  const { data: sessions, isLoading } = useSessions(projectId);
  const { openNewTaskModal } = useUI();

  const activeSessions = sessions?.filter((s) => s.status === "active") || [];
  const archivedSessions = sessions?.filter((s) => s.status === "archived") || [];

  const handleCreateTask = () => {
    openNewTaskModal();
  };

  if (isLoading) {
    return (
      <div className="p-3 text-sm text-text-muted">Loading tasks...</div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-2 py-1 border-b border-border flex items-center justify-between">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Tasks
        </div>
        <button
          onClick={handleCreateTask}
          className="p-1 hover:bg-bg-elevated rounded text-text-secondary hover:text-text-primary"
          title="New Task"
          data-testid="new-task-button"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-auto py-1">
        {activeSessions.length === 0 && archivedSessions.length === 0 ? (
          <div className="px-3 py-4 text-sm text-text-muted text-center">
            <p>No tasks yet</p>
            <button
              onClick={handleCreateTask}
              className="mt-2 text-accent-primary hover:underline"
            >
              Create your first task
            </button>
          </div>
        ) : (
          <>
            {activeSessions.map((session) => (
              <TaskItem
                key={session.id}
                session={session}
                projectId={projectId}
              />
            ))}

            {archivedSessions.length > 0 && (
              <>
                <div className="px-3 py-2 mt-2 text-xs text-text-muted border-t border-border">
                  Archived ({archivedSessions.length})
                </div>
                {archivedSessions.map((session) => (
                  <TaskItem
                    key={session.id}
                    session={session}
                    projectId={projectId}
                    archived
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TaskItem({
  session,
  projectId,
  archived,
}: {
  session: Session;
  projectId: string;
  archived?: boolean;
}) {
  const { openPreviewTab } = useTabs();
  const navigate = useNavigate();
  const { closeSidebarOnMobile } = useUI();

  const handleClick = () => {
    openPreviewTab({
      type: "task",
      sessionId: session.id,
      projectId,
      title: session.title,
    });
    navigate({ to: "/tasks/$sessionId", params: { sessionId: session.id } });
    closeSidebarOnMobile();
  };

  const timeAgo = formatTimeAgo(session.createdAt);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full px-3 py-2 text-left",
        "hover:bg-bg-elevated transition-colors",
        "flex items-start gap-2 group",
        archived && "opacity-60"
      )}
      data-testid={`task-item-${session.id}`}
    >
      <MessageSquare className="w-4 h-4 mt-0.5 text-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary truncate">
          {session.title || "Untitled Task"}
        </div>
        <div className="text-xs text-text-muted">
          {timeAgo}
          {session.messageCount > 0 && ` · ${session.messageCount} msgs`}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          // TODO: Show context menu
        }}
        className="p-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto hover:bg-bg-secondary rounded"
      >
        <MoreHorizontal className="w-3 h-3 text-text-muted" />
      </button>
    </button>
  );
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}
