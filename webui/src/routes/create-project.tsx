import { createFileRoute } from "@tanstack/react-router";
import { CreateProjectPage } from "@/primitives/project";

export const Route = createFileRoute("/create-project")({
  component: CreateProjectPageRoute,
});

function CreateProjectPageRoute() {
  return <CreateProjectPage params={{}} />;
}
