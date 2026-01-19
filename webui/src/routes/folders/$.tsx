import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FolderView } from "@/components/folders/FolderView";

const folderSearchSchema = z.object({
  commit: z.string().optional(),
});

export const Route = createFileRoute("/folders/$")({
  component: FolderViewPage,
  validateSearch: folderSearchSchema,
});

function FolderViewPage() {
  const params = Route.useParams();
  const { commit } = Route.useSearch();
  const splatPath = params._splat || "";

  // Path format: projectId/path/to/folder (or just projectId for root)
  const parts = splatPath.split("/");
  const projectId = parts[0] || "";
  const folderPath = parts.slice(1).join("/");

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Invalid folder path
      </div>
    );
  }

  return (
    <div className="h-full">
      <FolderView projectId={projectId} path={folderPath} commit={commit} />
    </div>
  );
}
