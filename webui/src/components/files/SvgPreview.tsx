import { useState } from "react";
import { CodeEditor } from "./CodeEditor";

interface SvgPreviewProps {
  projectId: string;
  path: string;
  commit?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function SvgPreview({ projectId, path: filePath, commit }: SvgPreviewProps) {
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const [error, setError] = useState(false);

  const filename = filePath.split("/").pop() || filePath;
  const src = `${API_BASE}/api/projects/${projectId}/files-raw/${encodeURIComponent(filePath)}`;

  if (mode === "source") {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-end px-3 py-1.5 border-b border-border bg-bg-subtle">
          <button
            onClick={() => setMode("preview")}
            className="px-3 py-1 text-xs rounded-md bg-bg hover:bg-bg-hover border border-border text-text-muted hover:text-text transition-colors"
          >
            Preview
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <CodeEditor projectId={projectId} path={filePath} commit={commit} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-subtle">
        <span className="text-xs text-text-muted font-medium">{filename}</span>
        <button
          onClick={() => setMode("source")}
          className="px-3 py-1 text-xs rounded-md bg-bg hover:bg-bg-hover border border-border text-text-muted hover:text-text transition-colors"
        >
          View Source
        </button>
      </div>

      {/* SVG container with checkerboard */}
      <div
        className="flex-1 flex items-center justify-center overflow-auto p-4"
        style={{
          backgroundImage: `linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)`,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      >
        {error ? (
          <div className="text-text-muted">Failed to load SVG</div>
        ) : (
          <img
            src={src}
            alt={filename}
            onError={() => setError(true)}
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>
    </div>
  );
}
