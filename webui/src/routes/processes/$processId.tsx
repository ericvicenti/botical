import { createFileRoute } from "@tanstack/react-router";
import { ProcessTerminalPage } from "@/primitives/process";

export const Route = createFileRoute("/processes/$processId")({
  component: ProcessViewRoute,
});

function ProcessViewRoute() {
  const { processId } = Route.useParams();
  return <ProcessTerminalPage params={{ processId }} />;
}
