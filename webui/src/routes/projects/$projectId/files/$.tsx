import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FileViewPage } from "@/primitives/file";

const fileSearchSchema = z.object({
  commit: z.string().optional(),
});

export const Route = createFileRoute("/projects/$projectId/files/$")({
  component: FileViewRoute,
  validateSearch: fileSearchSchema,
});

function FileViewRoute() {
  const { projectId, _splat: filePath } = Route.useParams();
  const search = Route.useSearch();

  return (
    <FileViewPage
      params={{ projectId, path: filePath || "" }}
      search={{ commit: search.commit }}
    />
  );
}
