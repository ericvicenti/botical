import { useState, useRef, useEffect } from "react";
import { useUI } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";
import { cn } from "@/lib/utils/cn";
import { Files, GitBranch, Play, Plus, FolderTree, MessageSquare, Settings, MoreHorizontal, FilePlus, FolderPlus } from "lucide-react";
import { ProjectSelector } from "./ProjectSelector";
import { FileTree, type FileTreeRef } from "@/components/files/FileTree";
import { TasksPanel } from "@/components/tasks/TasksPanel";
import { useProjects } from "@/lib/api/queries";
import { useNavigate } from "@tanstack/react-router";

const PANELS = [
  { id: "tasks", icon: MessageSquare, label: "Tasks" },
  { id: "files", icon: Files, label: "Files" },
  { id: "git", icon: GitBranch, label: "Git" },
  { id: "run", icon: Play, label: "Run" },
] as const;

export function Sidebar() {
  const {
    sidebarCollapsed,
    sidebarPanel,
    setSidebarPanel,
    toggleSidebar,
    selectedProjectId,
  } = useUI();

  if (sidebarCollapsed) {
    return (
      <div className="w-12 bg-bg-secondary border-r border-border flex flex-col">
        {selectedProjectId ? (
          PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => {
                setSidebarPanel(panel.id);
                toggleSidebar();
              }}
              className={cn(
                "w-12 h-12 flex items-center justify-center",
                "hover:bg-bg-elevated transition-colors",
                sidebarPanel === panel.id
                  ? "text-accent-primary border-l-2 border-accent-primary"
                  : "text-text-secondary"
              )}
              title={panel.label}
            >
              <panel.icon className="w-5 h-5" />
            </button>
          ))
        ) : (
          <button
            onClick={toggleSidebar}
            className={cn(
              "w-12 h-12 flex items-center justify-center",
              "hover:bg-bg-elevated transition-colors",
              "text-accent-primary border-l-2 border-accent-primary"
            )}
            title="Projects"
          >
            <FolderTree className="w-5 h-5" />
          </button>
        )}

        {/* Spacer and Settings at bottom */}
        <div className="flex-1" />
        <SettingsButton />
      </div>
    );
  }

  // When no project is selected, show project list instead of panels
  if (!selectedProjectId) {
    return (
      <div className="w-60 bg-bg-secondary border-r border-border flex flex-col">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Projects
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <ProjectList />
        </div>
        <div className="border-t border-border">
          <SettingsButton />
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-bg-secondary border-r border-border flex flex-col">
      <ProjectSelector />
      <div className="flex flex-1 min-h-0">
        <div className="w-12 border-r border-border flex flex-col shrink-0">
          {PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setSidebarPanel(panel.id)}
              className={cn(
                "w-12 h-12 flex items-center justify-center",
                "hover:bg-bg-elevated transition-colors",
                sidebarPanel === panel.id
                  ? "text-accent-primary border-l-2 border-accent-primary"
                  : "text-text-secondary"
              )}
              title={panel.label}
            >
              <panel.icon className="w-5 h-5" />
            </button>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Settings button at bottom */}
          <SettingsButton />
        </div>

        <div className="flex-1 overflow-hidden">
          <SidebarPanel panel={sidebarPanel} />
        </div>
      </div>
    </div>
  );
}

function ProjectList() {
  const { data: projects, isLoading } = useProjects();
  const { setSelectedProject } = useUI();
  const { openTab } = useTabs();
  const navigate = useNavigate();

  const handleSelectProject = (project: { id: string; name: string }) => {
    setSelectedProject(project.id);
    openTab({
      type: "project",
      projectId: project.id,
      projectName: project.name,
    });
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  const handleCreateProject = () => {
    openTab({ type: "create-project" });
    navigate({ to: "/create-project" });
  };

  if (isLoading) {
    return (
      <div className="p-3 text-sm text-text-muted">Loading projects...</div>
    );
  }

  return (
    <div className="py-1">
      {projects?.map((project) => (
        <button
          key={project.id}
          onClick={() => handleSelectProject(project)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-left",
            "hover:bg-bg-elevated transition-colors",
            "text-sm text-text-primary"
          )}
        >
          <FolderTree className="w-4 h-4 text-accent-primary shrink-0" />
          <span className="truncate">{project.name}</span>
        </button>
      ))}
      {projects && projects.length === 0 && (
        <div className="px-3 py-2 text-sm text-text-muted">
          No projects yet
        </div>
      )}
      <div className="border-t border-border my-1" />
      <button
        onClick={handleCreateProject}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left",
          "hover:bg-bg-elevated transition-colors",
          "text-sm text-accent-primary"
        )}
      >
        <Plus className="w-4 h-4 shrink-0" />
        <span>Create New Project</span>
      </button>
    </div>
  );
}

function SidebarPanel({ panel }: { panel: string }) {
  const { selectedProjectId } = useUI();

  switch (panel) {
    case "tasks":
      return selectedProjectId ? (
        <TasksPanel projectId={selectedProjectId} />
      ) : (
        <div className="p-3 text-sm text-text-muted">
          Select a project to view tasks
        </div>
      );
    case "files":
      return <FilesPanel selectedProjectId={selectedProjectId} />;
    case "git":
      return <GitPanel selectedProjectId={selectedProjectId} />;
    case "run":
      return <RunPanel selectedProjectId={selectedProjectId} />;
    default:
      return null;
  }
}

/**
 * FilesPanel Component
 *
 * Displays the project file tree with a dropdown menu for creating files/folders.
 * The "..." dropdown button in the header provides quick access to file creation
 * without requiring a right-click context menu.
 *
 * Uses FileTreeRef to communicate with the FileTree component:
 * - createFile(): Triggers inline file creation at root level
 * - createFolder(): Triggers inline folder creation at root level
 *
 * @param selectedProjectId - Currently selected project ID, or null if none
 */
function FilesPanel({ selectedProjectId }: { selectedProjectId: string | null }) {
  /** Ref to FileTree for triggering creation externally */
  const fileTreeRef = useRef<FileTreeRef>(null);
  /** Controls dropdown menu visibility */
  const [menuOpen, setMenuOpen] = useState(false);
  /** Ref for click-outside detection */
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (!selectedProjectId) {
    return (
      <div className="p-2">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
          Files
        </div>
        <div className="text-sm text-text-muted">
          Select a project to browse files
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 border-b border-border flex items-center justify-between">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Files
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              "p-0.5 rounded hover:bg-bg-elevated transition-colors",
              "text-text-secondary hover:text-text-primary"
            )}
            title="File actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-bg-elevated border border-border rounded shadow-lg py-1 min-w-32">
              <button
                onClick={() => {
                  fileTreeRef.current?.createFile();
                  setMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
              >
                <FilePlus className="w-3.5 h-3.5" />
                New File
              </button>
              <button
                onClick={() => {
                  fileTreeRef.current?.createFolder();
                  setMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New Folder
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        <FileTree ref={fileTreeRef} projectId={selectedProjectId} />
      </div>
    </div>
  );
}

function GitPanel({ selectedProjectId }: { selectedProjectId: string | null }) {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Source Control
      </div>
      {selectedProjectId ? (
        <div className="text-sm text-text-muted">Git integration coming soon</div>
      ) : (
        <div className="text-sm text-text-muted">Select a project to view git status</div>
      )}
    </div>
  );
}

function RunPanel({ selectedProjectId }: { selectedProjectId: string | null }) {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Commands & Services
      </div>
      {selectedProjectId ? (
        <div className="text-sm text-text-muted">No running processes</div>
      ) : (
        <div className="text-sm text-text-muted">Select a project to manage processes</div>
      )}
    </div>
  );
}

function SettingsButton() {
  const { openTab } = useTabs();
  const navigate = useNavigate();

  const handleClick = () => {
    openTab({ type: "settings" });
    navigate({ to: "/settings" });
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-12 h-12 flex items-center justify-center",
        "hover:bg-bg-elevated transition-colors",
        "text-text-secondary hover:text-text-primary"
      )}
      title="Settings"
      data-testid="settings-button"
    >
      <Settings className="w-5 h-5" />
    </button>
  );
}
