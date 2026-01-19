/**
 * FileTree Component
 *
 * A hierarchical file browser component that displays project files in a tree structure.
 * Supports file operations (open, rename, delete), folder expansion, and inline creation.
 *
 * Features:
 * - Lazy-loading of folder contents on expand
 * - Context menu for file operations (right-click)
 * - Inline file/folder creation with auto-focus
 * - "Reveal in tree" functionality to navigate to a specific file
 * - External triggering of creation via ref (for dropdown menus)
 *
 * @example
 * // Basic usage
 * <FileTree projectId="prj_123" />
 *
 * // With ref for external triggering
 * const fileTreeRef = useRef<FileTreeRef>(null);
 * <FileTree ref={fileTreeRef} projectId="prj_123" />
 * fileTreeRef.current?.createFile(); // Triggers inline file creation at root
 *
 * @see FileContextMenu - Context menu component used for file operations
 * @see CreateInput - Inline input component for file/folder creation
 */
import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { useFiles, useRenameFile, type FileEntry } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
} from "lucide-react";
import {
  FileContextMenu,
  CreateInput,
  type ContextMenuPosition,
  type ContextMenuTarget,
} from "./FileContextMenu";

/** Props for the FileTree component */
interface FileTreeProps {
  projectId: string;
}

/** State for tracking inline file/folder creation */
interface CreateState {
  type: "file" | "folder";
  parentPath: string;
}

/**
 * Ref interface for external control of the FileTree.
 * Allows parent components (like FilesPanel dropdown) to trigger
 * file/folder creation without direct access to internal state.
 */
export interface FileTreeRef {
  /** Triggers inline file creation at the root level */
  createFile: () => void;
  /** Triggers inline folder creation at the root level */
  createFolder: () => void;
}

export const FileTree = forwardRef<FileTreeRef, FileTreeProps>(function FileTree({ projectId }, ref) {
  const { data: rootFiles, isLoading } = useFiles(projectId);
  const { revealPath } = useUI();
  const { tabs, activeTabId } = useTabs();
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    target: ContextMenuTarget;
  } | null>(null);
  const [createState, setCreateState] = useState<CreateState | null>(null);

  // Get the active file/folder path from the current tab
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activePath = activeTab?.data.type === "file" || activeTab?.data.type === "folder"
    ? (activeTab.data as { path: string }).path
    : null;

  const handleStartCreate = useCallback((type: "file" | "folder", parentPath: string) => {
    setCreateState({ type, parentPath });
  }, []);

  // Expose methods via ref for external triggering
  useImperativeHandle(ref, () => ({
    createFile: () => handleStartCreate("file", ""),
    createFolder: () => handleStartCreate("folder", ""),
  }), [handleStartCreate]);

  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      target: { type: "empty", parentPath: "" },
    });
  };

  if (isLoading) {
    return <div className="p-2 text-text-secondary text-sm">Loading...</div>;
  }

  if (!rootFiles?.length) {
    return (
      <div
        className="h-full min-h-16 p-2 text-text-muted text-sm"
        onContextMenu={handleEmptyContextMenu}
      >
        No files
        {contextMenu && (
          <FileContextMenu
            projectId={projectId}
            position={contextMenu.position}
            target={contextMenu.target}
            onClose={() => setContextMenu(null)}
            onStartCreate={handleStartCreate}
          />
        )}
        {createState && createState.parentPath === "" && (
          <CreateInput
            type={createState.type}
            parentPath=""
            projectId={projectId}
            onComplete={() => setCreateState(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="text-sm h-full" onContextMenu={handleEmptyContextMenu}>
      {createState && createState.parentPath === "" && (
        <CreateInput
          type={createState.type}
          parentPath=""
          projectId={projectId}
          onComplete={() => setCreateState(null)}
        />
      )}
      {rootFiles.map((file) => (
        <FileTreeNode
          key={file.path}
          file={file}
          projectId={projectId}
          depth={0}
          revealPath={revealPath}
          activePath={activePath}
          createState={createState}
          onStartCreate={handleStartCreate}
          onCreateComplete={() => setCreateState(null)}
        />
      ))}
      {contextMenu && (
        <FileContextMenu
          projectId={projectId}
          position={contextMenu.position}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
          onStartCreate={handleStartCreate}
        />
      )}
    </div>
  );
});

/** Props for individual file/folder nodes in the tree */
interface FileTreeNodeProps {
  /** The file or folder entry to display */
  file: FileEntry;
  /** Project identifier for API calls */
  projectId: string;
  /** Current nesting depth (used for indentation) */
  depth: number;
  /** Path to reveal/highlight in the tree (for "reveal in tree" feature) */
  revealPath: string | null;
  /** Currently active/open file path (for highlighting) */
  activePath: string | null;
  /** Current inline creation state (if any) */
  createState: CreateState | null;
  /** Callback to initiate file/folder creation */
  onStartCreate: (type: "file" | "folder", parentPath: string) => void;
  /** Callback when creation is complete or cancelled */
  onCreateComplete: () => void;
}

/**
 * Recursive component that renders a single file or folder node.
 * Handles expansion, selection, context menus, and inline renaming.
 */
function FileTreeNode({
  file,
  projectId,
  depth,
  revealPath,
  activePath,
  createState,
  onStartCreate,
  onCreateComplete,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: children, isLoading } = useFiles(projectId, file.path);
  const { openTab, openPreviewTab } = useTabs();
  const navigate = useNavigate();
  const renameFile = useRenameFile();

  // Check if this node should be expanded to reveal the target path
  const shouldReveal = revealPath && (
    revealPath === file.path ||
    revealPath.startsWith(file.path + "/")
  );
  const isTarget = revealPath === file.path;

  // Check if this is the currently active/open file
  const isActive = activePath === file.path;

  // Check if we're creating inside this folder
  const isCreatingHere = createState && createState.parentPath === file.path;

  // Auto-expand when this folder is on the reveal path or when creating inside
  useEffect(() => {
    if ((shouldReveal || isCreatingHere) && file.type === "directory" && !expanded) {
      setExpanded(true);
    }
  }, [shouldReveal, isCreatingHere, file.type, expanded]);

  // Scroll into view when this is the target
  useEffect(() => {
    if (isTarget && nodeRef.current) {
      nodeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isTarget]);

  // Focus input when renaming
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // Only show children when expanded and it's a directory
  const shouldShowChildren = file.type === "directory" && expanded;

  // Single click opens preview tab
  const handleClick = useCallback(() => {
    if (isRenaming) return;
    if (file.type === "directory") {
      // Open folder preview tab and toggle expansion
      openPreviewTab({
        type: "folder",
        projectId,
        path: file.path,
      });
      navigate({ to: `/folders/${projectId}/${file.path}` });
      setExpanded(!expanded);
    } else {
      openPreviewTab({
        type: "file",
        projectId,
        path: file.path,
      });
      navigate({ to: `/files/${projectId}/${file.path}` });
    }
  }, [file, projectId, expanded, openPreviewTab, navigate, isRenaming]);

  // Double click opens permanent tab
  const handleDoubleClick = useCallback(() => {
    if (isRenaming) return;
    if (file.type === "directory") {
      openTab({
        type: "folder",
        projectId,
        path: file.path,
      });
      navigate({ to: `/folders/${projectId}/${file.path}` });
    } else {
      openTab({
        type: "file",
        projectId,
        path: file.path,
      });
      navigate({ to: `/files/${projectId}/${file.path}` });
    }
  }, [file, projectId, openTab, navigate, isRenaming]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRenameStart = () => {
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

  const contextMenuTarget: ContextMenuTarget = file.type === "directory"
    ? { type: "folder", path: file.path, name: file.name }
    : { type: "file", path: file.path, name: file.name };

  return (
    <div>
      <div
        ref={nodeRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          "flex items-center gap-1 py-0.5 px-2 cursor-pointer select-none",
          "hover:bg-bg-elevated rounded",
          "text-text-primary",
          isTarget && "bg-accent-primary/20 ring-1 ring-accent-primary/50",
          isActive && !isTarget && "bg-bg-elevated"
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
        <FileContextMenu
          projectId={projectId}
          position={contextMenu}
          target={contextMenuTarget}
          onClose={() => setContextMenu(null)}
          onStartRename={handleRenameStart}
          onStartCreate={onStartCreate}
        />
      )}

      {shouldShowChildren && (
        <div>
          {/* Show create input at the top of folder contents */}
          {isCreatingHere && (
            <CreateInput
              type={createState!.type}
              parentPath={file.path}
              projectId={projectId}
              onComplete={onCreateComplete}
              depth={depth + 1}
            />
          )}
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
                revealPath={revealPath}
                activePath={activePath}
                createState={createState}
                onStartCreate={onStartCreate}
                onCreateComplete={onCreateComplete}
              />
            ))
          ) : !isCreatingHere ? (
            <div
              className="text-text-muted text-xs py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              Empty
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * File icon component with color-coding based on file extension.
 * Provides visual differentiation for common file types.
 */
function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();

  /** Map of file extensions to Tailwind color classes */
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
