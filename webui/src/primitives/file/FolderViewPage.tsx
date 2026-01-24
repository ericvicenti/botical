import { FolderView } from "@/components/folders/FolderView";

interface FolderViewPageProps {
  params: {
    projectId: string;
    path: string;
  };
  search?: unknown;
}

export default function FolderViewPage({ params, search }: FolderViewPageProps) {
  const { projectId, path: folderPath } = params;
  // Parse search params safely
  const searchObj = search as { commit?: string } | undefined;
  const commit = searchObj?.commit;

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
