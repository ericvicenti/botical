/**
 * Image Browser Page
 *
 * Shows a list of Docker images with pull/remove functionality.
 */

import { useState } from "react";
import {
  Box,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  useDockerImages,
  usePullImage,
  useRemoveImage,
  type DockerImage,
} from "../api";

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

interface ImageRowProps {
  image: DockerImage;
  onRemove: () => void;
  isRemoving: boolean;
}

function ImageRow({ image, onRemove, isRemoving }: ImageRowProps) {
  const primaryTag = image.repoTags[0] || "<none>:<none>";
  const [name, tag] = primaryTag.split(":");

  return (
    <tr className="border-b border-border hover:bg-bg-elevated transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-text-primary">{name}</div>
        <div className="text-xs text-text-muted">{image.id.slice(7, 19)}</div>
      </td>
      <td className="px-4 py-3">
        <span className="px-2 py-0.5 bg-bg-elevated rounded text-xs text-text-secondary">{tag}</span>
      </td>
      <td className="px-4 py-3 text-text-secondary">{formatSize(image.size)}</td>
      <td className="px-4 py-3 text-text-secondary">{formatDate(image.created)}</td>
      <td className="px-4 py-3">
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="p-1.5 rounded hover:bg-accent-error/20 text-text-secondary hover:text-accent-error disabled:opacity-50 transition-colors"
          title="Remove image"
        >
          {isRemoving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </td>
    </tr>
  );
}

export function ImageBrowserPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [pullInput, setPullInput] = useState("");
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const { data: images, isLoading, error } = useDockerImages();
  const pullImage = usePullImage();
  const removeImage = useRemoveImage();

  const handlePull = () => {
    if (!pullInput.trim()) return;

    const [image, tag] = pullInput.split(":");
    pullImage.mutate(
      { image, tag },
      {
        onSuccess: () => {
          setPullInput("");
        },
        onError: (error) => {
          console.error("Failed to pull image:", error);
          alert(`Failed to pull image: ${error.message}`);
        },
      }
    );
  };

  const handleRemove = (image: DockerImage) => {
    if (!confirm(`Are you sure you want to remove image "${image.repoTags[0] || image.id}"?`)) {
      return;
    }

    setRemovingIds((prev) => new Set(prev).add(image.id));
    removeImage.mutate(
      { imageId: image.id, force: true },
      {
        onSettled: () => {
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(image.id);
            return next;
          });
        },
        onError: (error) => {
          console.error("Failed to remove image:", error);
          alert(`Failed to remove image: ${error.message}`);
        },
      }
    );
  };

  // Filter images by search query
  const filteredImages = images?.filter((image) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      image.repoTags.some((tag) => tag.toLowerCase().includes(query)) ||
      image.id.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-8 h-8 text-accent-error mb-2" />
        <div className="text-text-secondary">Failed to load images</div>
        <div className="text-sm text-text-muted mt-1">{error.message}</div>
      </div>
    );
  }

  const inputClassName = cn(
    "px-3 py-2 text-sm rounded border border-border",
    "bg-bg-primary text-text-primary",
    "focus:outline-none focus:border-accent-primary transition-colors"
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Box className="w-5 h-5 text-accent-primary" />
          <h1 className="text-lg font-medium text-text-primary">Docker Images</h1>
          <span className="text-sm text-text-muted">({images?.length || 0})</span>
        </div>
      </div>

      {/* Pull image form */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={pullInput}
            onChange={(e) => setPullInput(e.target.value)}
            placeholder="Pull image (e.g., nginx:latest)"
            className={cn(inputClassName, "flex-1")}
            onKeyDown={(e) => e.key === "Enter" && handlePull()}
          />
          <button
            onClick={handlePull}
            disabled={!pullInput.trim() || pullImage.isPending}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded text-sm",
              "bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {pullImage.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Pull
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search images..."
            className={cn(
              "w-full pl-9 pr-3 py-1.5 text-sm rounded border border-border",
              "bg-bg-primary text-text-primary",
              "focus:outline-none focus:border-accent-primary transition-colors"
            )}
          />
        </div>
      </div>

      {/* Image table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-bg-secondary">
            <tr className="text-left text-xs text-text-muted uppercase">
              <th className="px-4 py-2 font-medium">Image</th>
              <th className="px-4 py-2 font-medium">Tag</th>
              <th className="px-4 py-2 font-medium">Size</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filteredImages?.map((image) => (
              <ImageRow
                key={image.id}
                image={image}
                onRemove={() => handleRemove(image)}
                isRemoving={removingIds.has(image.id)}
              />
            ))}
          </tbody>
        </table>

        {filteredImages?.length === 0 && (
          <div className="text-center text-text-muted py-8">
            {searchQuery ? "No images match your search" : "No images found"}
          </div>
        )}
      </div>
    </div>
  );
}
