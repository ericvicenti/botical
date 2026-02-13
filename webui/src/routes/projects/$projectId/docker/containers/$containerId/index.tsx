import { createFileRoute } from "@tanstack/react-router";
import { ContainerDetailPage } from "@/extensions/docker";

export const Route = createFileRoute("/projects/$projectId/docker/containers/$containerId/")({
  component: ContainerDetailRoute,
});

function ContainerDetailRoute() {
  const { containerId } = Route.useParams();
  return <ContainerDetailPage params={{ containerId }} />;
}
