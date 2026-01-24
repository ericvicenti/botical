import { CodeEditor } from "@/components/files/CodeEditor";

interface FileViewPageProps {
  params: {
    projectId: string;
    path: string;
  };
  search?: unknown;
}

export default function FileViewPage({ params, search }: FileViewPageProps) {
  const { projectId, path: filePath } = params;
  // Parse search params safely
  const searchObj = search as { commit?: string } | undefined;
  const commit = searchObj?.commit;

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
