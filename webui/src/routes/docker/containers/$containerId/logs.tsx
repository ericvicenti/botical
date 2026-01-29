import { createFileRoute } from "@tanstack/react-router";
import { ContainerLogsPage } from "@/extensions/docker";

export const Route = createFileRoute("/docker/containers/$containerId/logs")({
  component: ContainerLogsRoute,
});

function ContainerLogsRoute() {
  const { containerId } = Route.useParams();
  return <ContainerLogsPage params={{ containerId }} />;
}
