import { createFileRoute } from "@tanstack/react-router";
import { ModelsPage } from "@/primitives/settings";

export const Route = createFileRoute("/settings/models")({
  component: ModelsRoute,
});

function ModelsRoute() {
  return <ModelsPage params={{}} />;
}
