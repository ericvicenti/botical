import { useState, useEffect } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronUp,
  Home,
  X,
  Check,
  GitBranch,
  Package,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils/cn";
import {
  useBrowseDirectory,
  useValidatePath,
  useCreateProject,
  type DirectoryEntry,
} from "@/lib/api/queries";

interface OpenProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectOpened: (project: { id: string; name: string }) => void;
}

export function OpenProjectModal({
  isOpen,
  onClose,
  onProjectOpened,
}: OpenProjectModalProps) {
  const [pathInput, setPathInput] = useState("");
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [showBrowser, setShowBrowser] = useState(true);

  const { data: browseData, isLoading: isBrowsing, error: browseError } =
    useBrowseDirectory(currentPath);
  const validatePath = useValidatePath();
  const createProject = useCreateProject();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPathInput("");
      setCurrentPath(undefined);
      setSelectedPath(null);
      setProjectName("");
      setShowBrowser(true);
    }
  }, [isOpen]);

  // Update path input when browse data changes
  useEffect(() => {
    if (browseData?.path) {
      setPathInput(browseData.path);
    }
  }, [browseData?.path]);

  const handlePathInputChange = (value: string) => {
    setPathInput(value);
    setSelectedPath(null);
  };

  const handlePathInputBlur = () => {
    if (pathInput && pathInput !== browseData?.path) {
      validatePath.mutate(
        { path: pathInput },
        {
          onSuccess: (data) => {
            if (data.valid) {
              setCurrentPath(data.path);
              setSelectedPath(data.path);
              if (data.suggestedName && !projectName) {
                setProjectName(data.suggestedName);
              }
            }
          },
        }
      );
    }
  };

  const handlePathInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePathInputBlur();
    }
  };

  const handleEntryClick = (entry: DirectoryEntry) => {
    if (entry.type === "directory") {
      setCurrentPath(entry.path);
      setSelectedPath(null);
    }
  };

  const handleEntryDoubleClick = (entry: DirectoryEntry) => {
    if (entry.type === "directory") {
      setSelectedPath(entry.path);
      setProjectName(entry.name);
    }
  };

  const handleSelectCurrentFolder = () => {
    if (browseData?.path) {
      setSelectedPath(browseData.path);
      const folderName = browseData.path.split("/").pop() || "";
      setProjectName(folderName);
    }
  };

  const handleGoUp = () => {
    if (browseData?.parent) {
      setCurrentPath(browseData.parent);
      setSelectedPath(null);
    }
  };

  const handleGoHome = () => {
    setCurrentPath(undefined);
    setSelectedPath(null);
  };

  const handleOpenProject = async () => {
    if (!selectedPath || !projectName.trim()) return;

    try {
      const result = await createProject.mutateAsync({
        name: projectName.trim(),
        path: selectedPath,
      });

      onProjectOpened({ id: result.id, name: result.name });
      onClose();
    } catch (error) {
      console.error("Failed to open project:", error);
    }
  };

  const isValidSelection = selectedPath && projectName.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} position="top" className="w-full sm:w-[600px]">
      <div className="flex flex-col max-h-[95vh] sm:max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            Open Existing Project
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-bg-tertiary transition-colors text-text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Path Input */}
        <div className="px-4 py-3 border-b border-border">
          <label
            htmlFor="path-input"
            className="block text-sm font-medium text-text-secondary mb-1"
          >
            Project Path
          </label>
          <input
            id="path-input"
            type="text"
            value={pathInput}
            onChange={(e) => handlePathInputChange(e.target.value)}
            onBlur={handlePathInputBlur}
            onKeyDown={handlePathInputKeyDown}
            placeholder="Enter or paste a path, e.g. ~/Projects/my-app"
            className={cn(
              "w-full px-3 py-2 rounded-lg",
              "bg-bg-tertiary border border-border",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-accent-primary"
            )}
          />
        </div>

        {/* Browser Toggle & Navigation */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-bg-tertiary/50">
          <button
            onClick={handleGoHome}
            className="p-1.5 rounded hover:bg-bg-tertiary transition-colors text-text-secondary"
            title="Go to home directory"
          >
            <Home className="w-4 h-4" />
          </button>
          <button
            onClick={handleGoUp}
            disabled={!browseData?.parent}
            className={cn(
              "p-1.5 rounded transition-colors",
              browseData?.parent
                ? "hover:bg-bg-tertiary text-text-secondary"
                : "text-text-muted cursor-not-allowed"
            )}
            title="Go up one level"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <div className="flex-1 text-sm text-text-muted truncate">
            {browseData?.path || "Loading..."}
          </div>
          <button
            onClick={() => setShowBrowser(!showBrowser)}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            {showBrowser ? "Hide" : "Show"} Browser
          </button>
        </div>

        {/* Directory Browser */}
        {showBrowser && (
          <div className="flex-1 overflow-auto min-h-[200px] max-h-[300px]">
            {isBrowsing ? (
              <div className="flex items-center justify-center h-full text-text-muted">
                Loading...
              </div>
            ) : browseError ? (
              <div className="flex items-center justify-center h-full text-accent-error px-4 text-center">
                <div>
                  <div className="font-medium mb-1">Failed to browse directory</div>
                  <div className="text-sm text-text-muted">
                    {browseError instanceof Error ? browseError.message : "Unknown error"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-1">
                {/* Select current folder button */}
                <button
                  onClick={handleSelectCurrentFolder}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2 text-left",
                    "hover:bg-bg-tertiary transition-colors",
                    "text-sm text-accent-primary font-medium"
                  )}
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span>Select Current Folder</span>
                  {browseData?.isGitRepo && (
                    <span title="Git repository">
                      <GitBranch className="w-3 h-3 text-text-muted" />
                    </span>
                  )}
                  {browseData?.hasPackageJson && (
                    <span title="Has package.json">
                      <Package className="w-3 h-3 text-text-muted" />
                    </span>
                  )}
                </button>

                {/* Directory entries - Git repos first, then regular folders */}
                {browseData?.entries
                  .filter((e) => e.type === "directory" && !e.isHidden)
                  .sort((a, b) => {
                    // Git repos first
                    if (a.isGitRepo && !b.isGitRepo) return -1;
                    if (!a.isGitRepo && b.isGitRepo) return 1;
                    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                  })
                  .map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => handleEntryClick(entry)}
                      onDoubleClick={() => handleEntryDoubleClick(entry)}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 text-left",
                        "hover:bg-bg-tertiary transition-colors",
                        "text-sm",
                        entry.isGitRepo
                          ? "text-text-primary font-medium"
                          : "text-text-secondary",
                        selectedPath === entry.path && "bg-bg-tertiary"
                      )}
                    >
                      {entry.isGitRepo ? (
                        <FolderOpen className="w-4 h-4 shrink-0 text-accent-primary" />
                      ) : (
                        <Folder className="w-4 h-4 shrink-0 text-text-muted" />
                      )}
                      <span className="flex-1 truncate">{entry.name}</span>
                      {entry.isGitRepo && (
                        <span className="flex items-center gap-1 text-xs text-accent-primary">
                          <GitBranch className="w-3 h-3" />
                        </span>
                      )}
                      {entry.hasPackageJson && !entry.isGitRepo && (
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <Package className="w-3 h-3" />
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                    </button>
                  ))}

                {/* Show hidden folders section */}
                {browseData?.entries.some(
                  (e) => e.type === "directory" && e.isHidden
                ) && (
                  <div className="border-t border-border mt-2 pt-2">
                    <div className="px-4 py-1 text-xs text-text-muted uppercase tracking-wide">
                      Hidden Folders
                    </div>
                    {browseData.entries
                      .filter((e) => e.type === "directory" && e.isHidden)
                      .map((entry) => (
                        <button
                          key={entry.path}
                          onClick={() => handleEntryClick(entry)}
                          onDoubleClick={() => handleEntryDoubleClick(entry)}
                          className={cn(
                            "w-full flex items-center gap-2 px-4 py-2 text-left",
                            "hover:bg-bg-tertiary transition-colors",
                            "text-sm text-text-muted",
                            selectedPath === entry.path && "bg-bg-tertiary"
                          )}
                        >
                          <Folder className="w-4 h-4 shrink-0" />
                          <span className="flex-1 truncate">{entry.name}</span>
                          <ChevronRight className="w-4 h-4 shrink-0" />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Selected Path & Project Name */}
        {selectedPath && (
          <div className="px-4 py-3 border-t border-border bg-bg-tertiary/30">
            <div className="flex items-center gap-2 mb-3 text-sm">
              <Check className="w-4 h-4 text-accent-success shrink-0" />
              <span className="text-text-secondary">Selected:</span>
              <span className="text-text-primary font-medium truncate">
                {selectedPath}
              </span>
            </div>
            <div>
              <label
                htmlFor="project-name"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Project Name
              </label>
              <input
                id="project-name"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Project"
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-bg-tertiary border border-border",
                  "text-text-primary placeholder:text-text-muted",
                  "focus:outline-none focus:ring-2 focus:ring-accent-primary"
                )}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium",
              "bg-bg-tertiary text-text-secondary",
              "hover:bg-bg-tertiary/80 transition-colors"
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleOpenProject}
            disabled={!isValidSelection || createProject.isPending}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium",
              "bg-accent-primary text-white",
              "hover:bg-accent-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {createProject.isPending ? "Opening..." : "Open Project"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
