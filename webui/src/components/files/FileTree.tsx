import { useState, useCallback, useRef, useEffect } from "react";
import { useFiles, useDeleteFile, useRenameFile, type FileEntry } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { cn } from "@/lib/utils/cn";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";

interface FileTreeProps {
  projectId: string;
}

export function FileTree({ projectId }: FileTreeProps) {
  const { data: rootFiles, isLoading } = useFiles(projectId);

  if (isLoading) {
    return <div className="p-2 text-text-secondary text-sm">Loading...</div>;
  }

  if (!rootFiles?.length) {
    return <div className="p-2 text-text-muted text-sm">No files</div>;
  }

  return (
    <div className="text-sm">
      {rootFiles.map((file) => (
        <FileTreeNode
          key={file.path}
          file={file}
          projectId={projectId}
          depth={0}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  file: FileEntry;
  projectId: string;
  depth: number;
}

function FileTreeNode({ file, projectId, depth }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(file.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: children, isLoading } = useFiles(projectId, file.path);
  const { openTab } = useTabs();
  const deleteFile = useDeleteFile();
  const renameFile = useRenameFile();

  // Only fetch children when expanded and it's a directory
  const shouldShowChildren = file.type === "directory" && expanded;

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [contextMenu]);

  // Focus input when renaming
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleClick = useCallback(() => {
    if (isRenaming) return;
    if (file.type === "directory") {
      setExpanded(!expanded);
    } else {
      openTab({
        type: "file",
        projectId,
        path: file.path,
      });
    }
  }, [file, projectId, expanded, openTab, isRenaming]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDelete = async () => {
    setContextMenu(null);
    if (confirm(`Delete "${file.name}"?`)) {
      try {
        await deleteFile.mutateAsync({ projectId, path: file.path });
      } catch (err) {
        console.error("Failed to delete:", err);
      }
    }
  };

  const handleRenameStart = () => {
    setContextMenu(null);
    setNewName(file.name);
    setIsRenaming(true);
  };

  const handleRenameSubmit = async () => {
    if (!newName.trim() || newName === file.name) {
      setIsRenaming(false);
      return;
    }

    const parentPath = file.path.includes("/")
      ? file.path.substring(0, file.path.lastIndexOf("/"))
      : "";
    const destination = parentPath ? `${parentPath}/${newName.trim()}` : newName.trim();

    try {
      await renameFile.mutateAsync({ projectId, path: file.path, newPath: destination });
      setIsRenaming(false);
    } catch (err) {
      console.error("Failed to rename:", err);
      setIsRenaming(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          "flex items-center gap-1 py-0.5 px-2 cursor-pointer",
          "hover:bg-bg-elevated rounded",
          "text-text-primary"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {file.type === "directory" ? (
          <>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="w-4 h-4 text-accent-warning shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-accent-warning shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileIcon filename={file.name} />
          </>
        )}
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 px-1 py-0 text-sm bg-bg-primary border border-accent-primary rounded focus:outline-none"
          />
        ) : (
          <span className="truncate">{file.name}</span>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-bg-elevated border border-border rounded shadow-lg py-1 min-w-32"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleRenameStart}
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
        </div>
      )}

      {shouldShowChildren && (
        <div>
          {isLoading ? (
            <div
              className="text-text-muted text-xs py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              Loading...
            </div>
          ) : children?.length ? (
            children.map((child) => (
              <FileTreeNode
                key={child.path}
                file={child}
                projectId={projectId}
                depth={depth + 1}
              />
            ))
          ) : (
            <div
              className="text-text-muted text-xs py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();

  const colorMap: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    json: "text-yellow-300",
    md: "text-white",
    css: "text-pink-400",
    html: "text-orange-400",
    py: "text-green-400",
    go: "text-cyan-400",
    rs: "text-orange-500",
    sh: "text-green-300",
    yml: "text-red-400",
    yaml: "text-red-400",
  };

  return (
    <File
      className={cn("w-4 h-4 shrink-0", colorMap[ext || ""] || "text-text-muted")}
    />
  );
}
