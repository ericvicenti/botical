import { createFileRoute } from "@tanstack/react-router";
import { CommitViewPage } from "@/primitives/git";

export const Route = createFileRoute("/projects/$projectId/commits/$hash")({
  component: CommitViewPageRoute,
});

function CommitViewPageRoute() {
  const { projectId, hash } = Route.useParams();
  return <CommitViewPage params={{ projectId, hash }} />;
}
