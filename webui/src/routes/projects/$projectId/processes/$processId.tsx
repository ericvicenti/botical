import { createFileRoute } from "@tanstack/react-router";
import { ProcessTerminalPage } from "@/primitives/process";

export const Route = createFileRoute("/projects/$projectId/processes/$processId")({
  component: ProcessViewRoute,
});

function ProcessViewRoute() {
  const { projectId, processId } = Route.useParams();
  return <ProcessTerminalPage params={{ processId, projectId }} />;
}
