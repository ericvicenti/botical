import { useState, useRef } from "react";

interface ImagePreviewProps {
  projectId: string;
  path: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function ImagePreview({ projectId, path: filePath }: ImagePreviewProps) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const filename = filePath.split("/").pop() || filePath;
  const src = `${API_BASE}/api/projects/${projectId}/files-raw/${encodeURIComponent(filePath)}`;

  const handleLoad = () => {
    if (imgRef.current) {
      setDimensions({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Failed to load image
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Image container with checkerboard background */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-4"
        style={{
          backgroundImage: `linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)`,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={filename}
          onLoad={handleLoad}
          onError={() => setError(true)}
          className="max-w-full max-h-full object-contain"
          style={{ imageRendering: "auto" }}
        />
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-bg-subtle text-text-muted text-xs">
        <span className="font-medium text-text">{filename}</span>
        {dimensions && (
          <span>{dimensions.w} × {dimensions.h}</span>
        )}
      </div>
    </div>
  );
}
