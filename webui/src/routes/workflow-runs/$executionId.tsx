import { createFileRoute } from "@tanstack/react-router";
import { WorkflowExecutionPage } from "@/primitives/workflow";

export const Route = createFileRoute("/workflow-runs/$executionId")({
  component: WorkflowExecutionRoute,
});

function WorkflowExecutionRoute() {
  const params = Route.useParams();

  return <WorkflowExecutionPage params={{ executionId: params.executionId }} />;
}
