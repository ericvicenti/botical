import { useState } from "react";
import { useFolderDetails, useProject } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";
import {
  Folder,
  File,
  Link2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import type { DetailedFileEntry } from "@/lib/api/types";

interface FolderViewProps {
  projectId: string;
  path: string;
}

type SortField = "name" | "size" | "modified" | "type" | "permissions";
type SortDirection = "asc" | "desc";

/**
 * Format bytes to human-readable size (like du -sh)
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format timestamp to human-readable date
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  } else if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Get icon for file type
 */
function getIcon(entry: DetailedFileEntry) {
  if (entry.type === "directory") return Folder;
  if (entry.type === "symlink") return Link2;
  return File;
}

/**
 * Get color for file type
 */
function getTypeColor(entry: DetailedFileEntry): string {
  if (entry.type === "directory") return "text-accent-primary";
  if (entry.type === "symlink") return "text-purple-400";
  if (entry.isHidden) return "text-text-muted";
  return "text-text-secondary";
}

export function FolderView({ projectId, path }: FolderViewProps) {
  const { data: folder, isLoading, error } = useFolderDetails(projectId, path);
  const { data: project } = useProject(projectId);
  const { openTab, openPreviewTab } = useTabs();
  const navigate = useNavigate();

  const [showHidden, setShowHidden] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Single click opens preview tab
  const handleOpenItem = (entry: DetailedFileEntry) => {
    if (entry.type === "directory") {
      openPreviewTab({
        type: "folder",
        projectId,
        path: entry.path,
      });
      navigate({ to: `/folders/${projectId}/${entry.path}` });
    } else {
      openPreviewTab({
        type: "file",
        projectId,
        path: entry.path,
      });
      navigate({ to: `/files/${projectId}/${entry.path}` });
    }
  };

  // Double click opens permanent tab
  const handleOpenItemPermanent = (entry: DetailedFileEntry) => {
    if (entry.type === "directory") {
      openTab({
        type: "folder",
        projectId,
        path: entry.path,
      });
      navigate({ to: `/folders/${projectId}/${entry.path}` });
    } else {
      openTab({
        type: "file",
        projectId,
        path: entry.path,
      });
      navigate({ to: `/files/${projectId}/${entry.path}` });
    }
  };

  const handleNavigateToFolder = (folderPath: string) => {
    openPreviewTab({
      type: "folder",
      projectId,
      path: folderPath,
    });
    navigate({ to: `/folders/${projectId}/${folderPath}` });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading folder contents...
      </div>
    );
  }

  if (error || !folder) {
    return (
      <div className="h-full flex items-center justify-center text-red-400">
        Failed to load folder: {error?.message || "Unknown error"}
      </div>
    );
  }

  // Filter and sort entries
  let entries = folder.entries;
  if (!showHidden) {
    entries = entries.filter((e) => !e.isHidden);
  }

  entries = [...entries].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "size":
        cmp = a.size - b.size;
        break;
      case "modified":
        cmp = a.modified - b.modified;
        break;
      case "type":
        cmp = a.type.localeCompare(b.type);
        break;
      case "permissions":
        cmp = a.permissions.localeCompare(b.permissions);
        break;
    }
    return sortDirection === "asc" ? cmp : -cmp;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-1" />
    );
  };

  // Build breadcrumb path
  const pathParts = path ? path.split("/") : [];

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header with folder info */}
      <div className="border-b border-border px-4 py-3">
        {/* Breadcrumb navigation */}
        <div className="flex items-center text-sm mb-2">
          <button
            onClick={() => handleNavigateToFolder("")}
            className={cn(
              "hover:text-accent-primary",
              pathParts.length === 0 ? "text-text-primary font-medium" : "text-text-muted"
            )}
          >
            {project?.name || "Project"}
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center">
              <span className="text-text-muted mx-1">/</span>
              <button
                onClick={() => handleNavigateToFolder(pathParts.slice(0, i + 1).join("/"))}
                className={cn(
                  "hover:text-accent-primary",
                  i === pathParts.length - 1 ? "text-text-primary font-medium" : "text-text-muted"
                )}
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* Folder stats */}
        <div className="flex items-center gap-4 text-sm text-text-muted">
          <span>
            <strong className="text-text-primary">{formatSize(folder.totalSize)}</strong> total
          </span>
          <span>
            <strong className="text-text-primary">{folder.fileCount}</strong> files
          </span>
          <span>
            <strong className="text-text-primary">{folder.folderCount}</strong> folders
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
              showHidden
                ? "bg-accent-primary/20 text-accent-primary"
                : "hover:bg-bg-elevated text-text-muted"
            )}
          >
            {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {showHidden ? "Showing hidden" : "Hidden files"}
          </button>
        </div>
      </div>

      {/* File table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-secondary border-b border-border">
            <tr>
              <th
                className="text-left px-4 py-2 font-medium text-text-muted cursor-pointer hover:text-text-primary"
                onClick={() => handleSort("name")}
              >
                Name <SortIcon field="name" />
              </th>
              <th
                className="text-left px-4 py-2 font-medium text-text-muted cursor-pointer hover:text-text-primary w-24"
                onClick={() => handleSort("permissions")}
              >
                Permissions <SortIcon field="permissions" />
              </th>
              <th
                className="text-right px-4 py-2 font-medium text-text-muted cursor-pointer hover:text-text-primary w-24"
                onClick={() => handleSort("size")}
              >
                Size <SortIcon field="size" />
              </th>
              <th
                className="text-right px-4 py-2 font-medium text-text-muted cursor-pointer hover:text-text-primary w-36"
                onClick={() => handleSort("modified")}
              >
                Modified <SortIcon field="modified" />
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                  {showHidden ? "Folder is empty" : "No visible files (try showing hidden files)"}
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const Icon = getIcon(entry);
                return (
                  <tr
                    key={entry.path}
                    onClick={() => handleOpenItem(entry)}
                    onDoubleClick={() => handleOpenItemPermanent(entry)}
                    className={cn(
                      "cursor-pointer border-b border-border/50 hover:bg-bg-elevated transition-colors",
                      entry.isHidden && "opacity-60"
                    )}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("w-4 h-4 shrink-0", getTypeColor(entry))} />
                        <span className={cn(
                          entry.type === "directory" ? "text-accent-primary font-medium" : "text-text-primary"
                        )}>
                          {entry.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-text-muted">
                      {entry.permissions}
                    </td>
                    <td className="px-4 py-2 text-right text-text-muted tabular-nums">
                      {formatSize(entry.size)}
                    </td>
                    <td className="px-4 py-2 text-right text-text-muted tabular-nums">
                      {formatDate(entry.modified)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
