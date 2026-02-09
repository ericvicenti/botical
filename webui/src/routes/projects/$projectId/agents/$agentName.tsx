import { createFileRoute } from "@tanstack/react-router";
import { AgentEditorPage } from "@/components/agents/AgentEditorPage";

export const Route = createFileRoute("/projects/$projectId/agents/$agentName")({
  component: AgentRoute,
});

function AgentRoute() {
  const { projectId, agentName } = Route.useParams();
  return <AgentEditorPage projectId={projectId} agentName={agentName} />;
}
