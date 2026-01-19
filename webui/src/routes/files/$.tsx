import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CodeEditor } from "@/components/files/CodeEditor";

const fileSearchSchema = z.object({
  commit: z.string().optional(),
});

export const Route = createFileRoute("/files/$")({
  component: FileView,
  validateSearch: fileSearchSchema,
});

function FileView() {
  const params = Route.useParams();
  const { commit } = Route.useSearch();
  const splatPath = params._splat || "";

  // Path format: projectId/path/to/file.ts
  const parts = splatPath.split("/");
  const projectId = parts[0] || "";
  const filePath = parts.slice(1).join("/");

  if (!projectId || !filePath) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Invalid file path
      </div>
    );
  }

  return (
    <div className="h-full">
      <CodeEditor projectId={projectId} path={filePath} commit={commit} />
    </div>
  );
}
