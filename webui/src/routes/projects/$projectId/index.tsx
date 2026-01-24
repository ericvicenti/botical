import { createFileRoute } from "@tanstack/react-router";
import { ProjectOverviewPage } from "@/primitives/project";

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectPageRoute,
});

function ProjectPageRoute() {
  const { projectId } = Route.useParams();
  return <ProjectOverviewPage params={{ projectId }} />;
}
