/**
 * FileContextMenu Component
 *
 * Provides right-click context menu functionality for the file tree.
 * Shows different options based on what was clicked:
 * - Empty area: New File, New Folder
 * - Folder: New File, New Folder, Rename, Delete
 * - File: Rename, Delete
 *
 * Also exports CreateInput for inline file/folder name input.
 *
 * @example
 * <FileContextMenu
 *   projectId="prj_123"
 *   position={{ x: 100, y: 100 }}
 *   target={{ type: "folder", path: "src", name: "src" }}
 *   onClose={() => setContextMenu(null)}
 *   onStartRename={handleRename}
 *   onStartCreate={handleCreate}
 * />
 */
import { useRef, useEffect, useState } from "react";
import { FilePlus, FolderPlus, Pencil, Trash2, Upload, Copy } from "lucide-react";
import { useCreateFile, useCreateFolder, useDeleteFile } from "@/lib/api/queries";
import { useToast } from "@/components/ui/Toast";

/** Position coordinates for the context menu */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Discriminated union type for context menu targets.
 * Determines which menu options are shown.
 */
export type ContextMenuTarget =
  | { type: "empty"; parentPath: string }
  | { type: "folder"; path: string; name: string }
  | { type: "file"; path: string; name: string };

/** Props for the FileContextMenu component */
interface FileContextMenuProps {
  /** Project identifier for API calls */
  projectId: string;
  /** Screen position where menu should appear */
  position: ContextMenuPosition;
  /** What was right-clicked (empty area, folder, or file) */
  target: ContextMenuTarget;
  /** Callback to close the menu */
  onClose: () => void;
  /** Callback to start inline rename (for files/folders) */
  onStartRename?: () => void;
  /** Callback to start inline creation (for empty area/folders) */
  onStartCreate?: (type: "file" | "folder", parentPath: string) => void;
  /** Callback to trigger file upload to a folder */
  onUploadFiles?: (targetPath: string) => void;
}

export function FileContextMenu({
  projectId,
  position,
  target,
  onClose,
  onStartRename,
  onStartCreate,
  onUploadFiles,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteFile = useDeleteFile();
  const { showToast } = useToast();

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleNewFile = () => {
    const parentPath = target.type === "folder" ? target.path : "";
    onStartCreate?.("file", parentPath);
    onClose();
  };

  const handleNewFolder = () => {
    const parentPath = target.type === "folder" ? target.path : "";
    onStartCreate?.("folder", parentPath);
    onClose();
  };

  const handleUpload = () => {
    const parentPath = target.type === "folder" ? target.path : "";
    onUploadFiles?.(parentPath);
    onClose();
  };

  const handleCopyPath = async () => {
    const path = target.type === "empty" ? target.parentPath || "/" : target.path;
    try {
      await navigator.clipboard.writeText(path);
      showToast("Path copied to clipboard", "success");
    } catch {
      showToast("Failed to copy path", "error");
    }
    onClose();
  };

  const handleRename = () => {
    onStartRename?.();
    onClose();
  };

  const handleDelete = async () => {
    if (target.type === "empty") return;
    onClose();
    if (confirm(`Delete "${target.name}"?`)) {
      try {
        await deleteFile.mutateAsync({ projectId, path: target.path });
      } catch (err) {
        console.error("Failed to delete:", err);
      }
    }
  };

  const showCreateOptions = target.type === "empty" || target.type === "folder";
  const showFileOptions = target.type === "file" || target.type === "folder";

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-bg-elevated border border-border rounded shadow-lg py-1 min-w-40"
      style={{ left: position.x, top: position.y }}
    >
      {showCreateOptions && (
        <>
          <button
            onClick={handleNewFile}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
          >
            <FilePlus className="w-3.5 h-3.5" />
            New File
          </button>
          <button
            onClick={handleNewFolder}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            New Folder
          </button>
          <button
            onClick={handleUpload}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Files
          </button>
        </>
      )}
      {(showCreateOptions || showFileOptions) && (
        <div className="my-1 border-t border-border" />
      )}
      <button
        onClick={handleCopyPath}
        className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
      >
        <Copy className="w-3.5 h-3.5" />
        Copy Path
      </button>
      {showFileOptions && (
        <>
          <button
            onClick={handleRename}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
          >
            <Pencil className="w-3.5 h-3.5" />
            Rename
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2 text-accent-error"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </>
      )}
    </div>
  );
}

/** Props for the CreateInput component */
interface CreateInputProps {
  /** Type of item to create */
  type: "file" | "folder";
  /** Parent directory path (empty string for root) */
  parentPath: string;
  /** Project identifier for API calls */
  projectId: string;
  /** Callback when creation completes or is cancelled */
  onComplete: () => void;
  /** Nesting depth for indentation (default: 0) */
  depth?: number;
}

/**
 * Inline input component for creating new files or folders.
 * Auto-focuses on mount and handles Enter (submit) and Escape (cancel).
 *
 * @example
 * <CreateInput
 *   type="file"
 *   parentPath="src/components"
 *   projectId="prj_123"
 *   onComplete={() => setCreateState(null)}
 *   depth={2}
 * />
 */
export function CreateInput({
  type,
  parentPath,
  projectId,
  onComplete,
  depth = 0,
}: CreateInputProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const createFile = useCreateFile();
  const createFolder = useCreateFolder();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) {
      onComplete();
      return;
    }

    const fullPath = parentPath ? `${parentPath}/${name.trim()}` : name.trim();

    try {
      if (type === "folder") {
        await createFolder.mutateAsync({ projectId, path: fullPath });
      } else {
        await createFile.mutateAsync({ projectId, path: fullPath, content: "" });
      }
      onComplete();
    } catch (err) {
      console.error("Failed to create:", err);
      onComplete();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      onComplete();
    }
  };

  return (
    <div
      className="flex items-center gap-1 py-0.5 px-2"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {type === "folder" ? (
        <FolderPlus className="w-4 h-4 text-accent-warning shrink-0" />
      ) : (
        <FilePlus className="w-4 h-4 text-text-muted shrink-0" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSubmit}
        placeholder={type === "folder" ? "folder-name" : "filename.ts"}
        className="flex-1 px-1 py-0 text-sm bg-bg-primary border border-accent-primary rounded focus:outline-none"
      />
    </div>
  );
}
