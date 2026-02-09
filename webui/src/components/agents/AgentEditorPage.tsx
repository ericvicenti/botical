import { useNavigate } from "@tanstack/react-router";
import { useAgent } from "@/lib/api/queries";
import { AgentEditor } from "./AgentEditor";

interface AgentEditorPageProps {
  projectId: string;
  agentName: string;
}

export function AgentEditorPage({ projectId, agentName }: AgentEditorPageProps) {
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(agentName, projectId);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading agent...
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Agent not found
      </div>
    );
  }

  return (
    <AgentEditor
      projectId={projectId}
      agent={agent}
      onBack={() => navigate({ to: "/projects/$projectId", params: { projectId } })}
    />
  );
}
