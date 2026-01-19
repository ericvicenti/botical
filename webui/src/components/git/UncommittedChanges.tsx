import { FileIcon, Plus, Minus, Edit, ArrowRight, HelpCircle, Copy, RotateCcw } from "lucide-react";
import type { FileChange, FileStatus } from "@/lib/api/types";
import { useDiscardChanges } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";

interface UncommittedChangesProps {
  projectId: string;
  files: FileChange[];
  onCommitClick: () => void;
}

function getStatusIcon(status: FileStatus) {
  switch (status) {
    case "A":
      return <Plus className="w-3.5 h-3.5 text-green-500" />;
    case "D":
      return <Minus className="w-3.5 h-3.5 text-red-500" />;
    case "M":
      return <Edit className="w-3.5 h-3.5 text-yellow-500" />;
    case "R":
      return <ArrowRight className="w-3.5 h-3.5 text-blue-500" />;
    case "C":
      return <Copy className="w-3.5 h-3.5 text-purple-500" />;
    case "?":
      return <HelpCircle className="w-3.5 h-3.5 text-gray-500" />;
    default:
      return <FileIcon className="w-3.5 h-3.5 text-text-secondary" />;
  }
}

function getStatusLabel(status: FileStatus): string {
  switch (status) {
    case "A":
      return "Added";
    case "D":
      return "Deleted";
    case "M":
      return "Modified";
    case "R":
      return "Renamed";
    case "C":
      return "Copied";
    case "?":
      return "Untracked";
    default:
      return "Unknown";
  }
}

export function UncommittedChanges({ projectId, files, onCommitClick }: UncommittedChangesProps) {
  const { openPreviewTab } = useTabs();
  const discardMutation = useDiscardChanges();

  const handleFileClick = (file: FileChange) => {
    // Open file in editor as preview tab
    openPreviewTab({
      type: "file",
      projectId,
      path: file.path,
    });
  };

  const handleDiscardFile = (e: React.MouseEvent, file: FileChange) => {
    e.stopPropagation();
    if (confirm(`Discard changes to ${file.path}?`)) {
      discardMutation.mutate({ projectId, file: file.path });
    }
  };

  if (files.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-text-secondary text-center">
        No uncommitted changes
      </div>
    );
  }

  return (
    <div>
      {/* Header with commit button */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-text-secondary">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
        </span>
        <button
          onClick={onCommitClick}
          className="px-2 py-1 bg-accent text-white text-xs rounded hover:bg-accent/90 transition-colors"
        >
          Commit All
        </button>
      </div>

      {/* File list */}
      <div className="space-y-0.5">
        {files.map((file) => (
          <div
            key={file.path}
            onClick={() => handleFileClick(file)}
            className="group flex items-center gap-2 px-3 py-1.5 hover:bg-bg-tertiary cursor-pointer"
          >
            {getStatusIcon(file.status)}
            <span className="flex-1 text-sm truncate" title={file.path}>
              {file.path}
            </span>
            <span className="text-xs text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
              {getStatusLabel(file.status)}
            </span>
            {file.status !== "?" && (
              <button
                onClick={(e) => handleDiscardFile(e, file)}
                className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-bg-secondary rounded transition-opacity"
                title="Discard changes"
              >
                <RotateCcw className="w-3.5 h-3.5 text-text-secondary hover:text-red-500" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
