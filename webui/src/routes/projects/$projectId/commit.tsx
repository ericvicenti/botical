import { createFileRoute } from "@tanstack/react-router";
import { ReviewCommitPage } from "@/primitives/git";

export const Route = createFileRoute("/projects/$projectId/commit")({
  component: ReviewCommitPageRoute,
});

function ReviewCommitPageRoute() {
  const { projectId } = Route.useParams();
  return <ReviewCommitPage params={{ projectId }} />;
}
