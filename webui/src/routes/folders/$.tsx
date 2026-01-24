import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FolderViewPage } from "@/primitives/file";

const folderSearchSchema = z.object({
  commit: z.string().optional(),
});

export const Route = createFileRoute("/folders/$")({
  component: FolderViewRoute,
  validateSearch: folderSearchSchema,
});

function FolderViewRoute() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const splatPath = params._splat || "";

  // Path format: projectId/path/to/folder (or just projectId for root)
  const parts = splatPath.split("/");
  const projectId = parts[0] || "";
  const folderPath = parts.slice(1).join("/");

  return (
    <FolderViewPage
      params={{ projectId, path: folderPath }}
      search={{ commit: search.commit }}
    />
  );
}
