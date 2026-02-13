import { useState, useEffect } from "react";
import { TaskChat } from "@/components/tasks/TaskChat";
import { useUI } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";
import { useQuery } from "@tanstack/react-query";

interface TaskChatPageProps {
  params: {
    sessionId: string;
    projectId?: string;
    title?: string;
    initialMessage?: string;
  };
}

/**
 * Fetch session without projectId to discover which project it belongs to.
 * The server searches across all projects and returns { ...session, projectId }.
 */
function useSessionLookup(sessionId: string, skip: boolean) {
  return useQuery({
    queryKey: ["session-lookup", sessionId],
    queryFn: async () => {
      const resp = await fetch(`/api/sessions/${sessionId}`);
      if (!resp.ok) return null;
      const json = await resp.json();
      return json.data?.projectId as string | null;
    },
    enabled: !!sessionId && !skip,
    staleTime: Infinity, // project won't change for a session
  });
}

export default function TaskChatPage({ params }: TaskChatPageProps) {
  const { sessionId, projectId: paramProjectId, initialMessage } = params;
  const { selectedProjectId } = useUI();
  const { activeTabId } = useTabs();

  // Try known projectId first, then fall back to server lookup
  const knownProjectId = paramProjectId || selectedProjectId;
  const { data: discoveredProjectId, isLoading } = useSessionLookup(sessionId, !!knownProjectId);
  const projectId = knownProjectId || discoveredProjectId;

  // Check if this task's tab is active
  const isActive = activeTabId === `task:${sessionId}`;

  if (isLoading && !projectId) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading...
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Session not found
      </div>
    );
  }

  return <TaskChat sessionId={sessionId} projectId={projectId} isActive={isActive} />;
}
