import { createFileRoute } from "@tanstack/react-router";
import { ProjectSettingsPage } from "@/primitives/project";

export const Route = createFileRoute("/projects/$projectId/settings")({
  component: ProjectSettingsPageRoute,
});

function ProjectSettingsPageRoute() {
  const { projectId } = Route.useParams();
  return <ProjectSettingsPage params={{ projectId }} />;
}
