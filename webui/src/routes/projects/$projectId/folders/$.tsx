import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FolderViewPage } from "@/primitives/file";

const folderSearchSchema = z.object({
  commit: z.string().optional(),
});

export const Route = createFileRoute("/projects/$projectId/folders/$")({
  component: FolderViewRoute,
  validateSearch: folderSearchSchema,
});

function FolderViewRoute() {
  const { projectId, _splat: folderPath } = Route.useParams();
  const search = Route.useSearch();

  return (
    <FolderViewPage
      params={{ projectId, path: folderPath || "" }}
      search={{ commit: search.commit }}
    />
  );
}
