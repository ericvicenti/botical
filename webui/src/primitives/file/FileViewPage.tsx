import { CodeEditor } from "@/components/files/CodeEditor";
import { ImagePreview } from "@/components/files/ImagePreview";
import { SvgPreview } from "@/components/files/SvgPreview";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"]);

function getFileExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot >= 0 ? filePath.slice(dot).toLowerCase() : "";
}

interface FileViewPageProps {
  params: {
    projectId: string;
    path: string;
  };
  search?: unknown;
}

export default function FileViewPage({ params, search }: FileViewPageProps) {
  const { projectId, path: filePath } = params;
  const searchObj = search as { commit?: string } | undefined;
  const commit = searchObj?.commit;

  if (!projectId || !filePath) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Invalid file path
      </div>
    );
  }

  const ext = getFileExtension(filePath);

  if (IMAGE_EXTENSIONS.has(ext)) {
    return (
      <div className="h-full">
        <ImagePreview projectId={projectId} path={filePath} />
      </div>
    );
  }

  if (ext === ".svg") {
    return (
      <div className="h-full">
        <SvgPreview projectId={projectId} path={filePath} commit={commit} />
      </div>
    );
  }

  return (
    <div className="h-full">
      <CodeEditor projectId={projectId} path={filePath} commit={commit} />
    </div>
  );
}
