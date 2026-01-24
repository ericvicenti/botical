import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FileViewPage } from "@/primitives/file";

const fileSearchSchema = z.object({
  commit: z.string().optional(),
});

export const Route = createFileRoute("/files/$")({
  component: FileViewRoute,
  validateSearch: fileSearchSchema,
});

function FileViewRoute() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const splatPath = params._splat || "";

  // Path format: projectId/path/to/file.ts
  const parts = splatPath.split("/");
  const projectId = parts[0] || "";
  const filePath = parts.slice(1).join("/");

  return (
    <FileViewPage
      params={{ projectId, path: filePath }}
      search={{ commit: search.commit }}
    />
  );
}
