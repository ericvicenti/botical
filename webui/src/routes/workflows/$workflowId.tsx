import { createFileRoute } from "@tanstack/react-router";
import { WorkflowEditorPage } from "@/primitives/workflow";

export const Route = createFileRoute("/workflows/$workflowId")({
  component: WorkflowEditorRoute,
});

function WorkflowEditorRoute() {
  const params = Route.useParams();

  return <WorkflowEditorPage params={{ workflowId: params.workflowId }} />;
}
