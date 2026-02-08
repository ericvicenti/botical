import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useUI, type SidebarPanel as SidebarPanelType } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";
import { cn } from "@/lib/utils/cn";
import { Files, GitBranch, Play, Plus, FolderTree, MessageSquare, Settings, MoreHorizontal, FilePlus, FolderPlus, Radio, Workflow, Server, Puzzle, Box, Search, Clock, Sparkles } from "lucide-react";
import { ProjectSelector } from "./ProjectSelector";
import { FileTree, type FileTreeRef } from "@/components/files/FileTree";
import { TasksPanel } from "@/components/tasks/TasksPanel";
import { ProcessesPanel } from "@/components/processes/ProcessesPanel";
import { ServicesPanel } from "@/components/services/ServicesPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { GitPanel as GitPanelComponent } from "@/components/git/GitPanel";
import { ExeSidebarPanel } from "@/extensions/exe/components/ExeSidebarPanel";
import { ExtensionsPanel } from "@/components/extensions/ExtensionsPanel";
import { DockerSidebarPanel } from "@/extensions/docker/components/DockerSidebarPanel";
import { SearchSidebarPanel } from "@/extensions/search/components/SearchSidebarPanel";
import { useProjects, useWorkflows, useCreateWorkflow } from "@/lib/api/queries";
import { SchedulesPanel } from "@/components/schedules";
import { useExtensions, useProjectExtensions } from "@/lib/api/extensions";
import { useNavigate } from "@tanstack/react-router";
import { SkillsBrowser } from "@/components/skills/SkillsBrowser";

const BASE_PROJECT_PANELS: { id: SidebarPanelType; icon: typeof MessageSquare; label: string }[] = [
  { id: "tasks", icon: MessageSquare, label: "Tasks" },
  { id: "files", icon: Files, label: "Files" },
  { id: "git", icon: GitBranch, label: "Git" },
  { id: "run", icon: Play, label: "Run" },
  { id: "services", icon: Radio, label: "Services" },
  { id: "workflows", icon: Workflow, label: "Workflows" },
  { id: "schedules", icon: Clock, label: "Schedules" },
  { id: "skills", icon: Sparkles, label: "Skills" },
];

// Map of extension icons
const EXTENSION_ICONS: Record<string, typeof Box> = {
  box: Box,
  container: Box,
  server: Server,
  search: Search,
};

export function Sidebar() {
  const {
    sidebarCollapsed,
    sidebarPanel,
    setSidebarPanel,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,
    selectedProjectId,
  } = useUI();

  const { data: extensions } = useExtensions();
  const { data: projectExtensions } = useProjectExtensions(selectedProjectId || "");

  // Build panel list based on enabled experiments and extensions
  const PROJECT_PANELS = useMemo(() => {
    const panels = [...BASE_PROJECT_PANELS];
    // Add enabled extension panels
    const enabledExtensionIds = projectExtensions?.enabled || [];
    if (extensions) {
      for (const ext of extensions) {
        if (enabledExtensionIds.includes(ext.id) && ext.frontend?.sidebar) {
          const iconName = ext.frontend.sidebar.icon;
          const IconComponent = EXTENSION_ICONS[iconName] || Puzzle;
          panels.push({
            id: ext.frontend.sidebar.id as SidebarPanelType,
            icon: IconComponent,
            label: ext.frontend.sidebar.label,
          });
        }
      }
    }

    return panels;
  }, [extensions, projectExtensions?.enabled]);

  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left;
        setSidebarWidth(newWidth);
      }
    },
    [isResizing, setSidebarWidth]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, resize, stopResizing]);

  // Unified sidebar with animation support
  const effectiveWidth = sidebarCollapsed ? 48 : sidebarWidth;

  // Handler for icon clicks when collapsed - expand and switch to panel
  const handleCollapsedIconClick = (panelId: SidebarPanelType) => {
    setSidebarPanel(panelId);
    toggleSidebar();
  };

  return (
    <div
      ref={sidebarRef}
      className="bg-bg-secondary border-r border-border flex flex-col relative transition-[width] duration-200 ease-out"
      style={{ width: effectiveWidth }}
    >
      {/* Project selector - only show when expanded and project selected */}
      {selectedProjectId && !sidebarCollapsed && <ProjectSelector />}

      <div className="flex flex-1 min-h-0">
        {/* Icon rail - always visible */}
        <div className={cn(
          "w-12 flex flex-col shrink-0",
          !sidebarCollapsed && "border-r border-border"
        )}>
          {selectedProjectId ? (
            PROJECT_PANELS.map((panel) => (
              <button
                key={panel.id}
                onClick={() => sidebarCollapsed ? handleCollapsedIconClick(panel.id) : setSidebarPanel(panel.id)}
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
              onClick={() => sidebarCollapsed ? toggleSidebar() : setSidebarPanel("files")}
              className={cn(
                "w-12 h-12 flex items-center justify-center",
                "hover:bg-bg-elevated transition-colors",
                sidebarPanel !== "settings"
                  ? "text-accent-primary border-l-2 border-accent-primary"
                  : "text-text-secondary"
              )}
              title="Projects"
            >
              <FolderTree className="w-5 h-5" />
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Extensions button */}
          {selectedProjectId && (
            <button
              onClick={() => sidebarCollapsed ? handleCollapsedIconClick("extensions") : setSidebarPanel("extensions")}
              className={cn(
                "w-12 h-12 flex items-center justify-center",
                "hover:bg-bg-elevated transition-colors",
                sidebarPanel === "extensions"
                  ? "text-accent-primary border-l-2 border-accent-primary"
                  : "text-text-secondary"
              )}
              title="Extensions"
              data-testid="extensions-button"
            >
              <Puzzle className="w-5 h-5" />
            </button>
          )}

          {/* Settings button at bottom */}
          <button
            onClick={() => sidebarCollapsed ? handleCollapsedIconClick("settings") : setSidebarPanel("settings")}
            className={cn(
              "w-12 h-12 flex items-center justify-center",
              "hover:bg-bg-elevated transition-colors",
              sidebarPanel === "settings"
                ? "text-accent-primary border-l-2 border-accent-primary"
                : "text-text-secondary"
            )}
            title="Settings"
            data-testid="settings-button"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Panel content - hidden when collapsed */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-out",
            sidebarCollapsed
              ? "w-0 opacity-0"
              : "flex-1 opacity-100"
          )}
          style={{
            transitionDelay: sidebarCollapsed ? "0ms" : "50ms",
          }}
        >
          {selectedProjectId ? (
            <SidebarPanelContent panel={sidebarPanel} />
          ) : (
            sidebarPanel === "settings" ? (
              <SettingsPanel />
            ) : (
              <div className="flex flex-col h-full">
                <div className="px-3 py-2 border-b border-border">
                  <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                    Projects
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <ProjectList />
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Resize handle - only when expanded */}
      {!sidebarCollapsed && (
        <ResizeHandle onMouseDown={startResizing} isResizing={isResizing} />
      )}
    </div>
  );
}

function ResizeHandle({
  onMouseDown,
  isResizing,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing: boolean;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "absolute top-0 right-0 w-1 h-full cursor-col-resize",
        "hover:bg-accent-primary/50 transition-colors",
        isResizing && "bg-accent-primary"
      )}
    />
  );
}

function ProjectList() {
  const { data: projects, isLoading } = useProjects();
  const { setSelectedProject } = useUI();
  const { openPreviewTab, openTab } = useTabs();
  const navigate = useNavigate();

  const handleSelectProject = (project: { id: string; name: string }) => {
    setSelectedProject(project.id);
    openPreviewTab({
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

function SidebarPanelContent({ panel }: { panel: string }) {
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
    case "services":
      return <ServicesPanelWrapper selectedProjectId={selectedProjectId} />;
    case "workflows":
      return <WorkflowsPanel selectedProjectId={selectedProjectId} />;
    case "schedules":
      return selectedProjectId ? (
        <SchedulesPanel projectId={selectedProjectId} />
      ) : (
        <div className="p-3 text-sm text-text-muted">
          Select a project to manage schedules
        </div>
      );
    case "skills":
      return selectedProjectId ? (
        <SkillsBrowser projectId={selectedProjectId} />
      ) : (
        <div className="p-3 text-sm text-text-muted">
          Select a project to manage skills
        </div>
      );
    case "exe":
      return <ExeSidebarPanel />;
    case "extensions":
      return selectedProjectId ? (
        <ExtensionsPanel projectId={selectedProjectId} />
      ) : (
        <div className="p-3 text-sm text-text-muted">
          Select a project to manage extensions
        </div>
      );
    case "search":
      return <SearchSidebarPanel />;
    case "docker":
      return <DockerSidebarPanel />;
    case "settings":
      return <SettingsPanel />;
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
  if (!selectedProjectId) {
    return (
      <div className="p-2">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
          Source Control
        </div>
        <div className="text-sm text-text-muted">Select a project to view git status</div>
      </div>
    );
  }

  return <GitPanelComponent projectId={selectedProjectId} />;
}

function RunPanel({ selectedProjectId }: { selectedProjectId: string | null }) {
  if (!selectedProjectId) {
    return (
      <div className="p-2">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
          Commands
        </div>
        <div className="text-sm text-text-muted">Select a project to run commands</div>
      </div>
    );
  }

  return <ProcessesPanel projectId={selectedProjectId} />;
}

function ServicesPanelWrapper({ selectedProjectId }: { selectedProjectId: string | null }) {
  if (!selectedProjectId) {
    return (
      <div className="p-2">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
          Services
        </div>
        <div className="text-sm text-text-muted">Select a project to manage services</div>
      </div>
    );
  }

  return <ServicesPanel projectId={selectedProjectId} />;
}

function WorkflowsPanel({ selectedProjectId }: { selectedProjectId: string | null }) {
  const navigate = useNavigate();
  const { data: workflows, isLoading } = useWorkflows(selectedProjectId || "");
  const createWorkflow = useCreateWorkflow();

  const handleCreateWorkflow = async () => {
    if (!selectedProjectId) return;

    try {
      const workflow = await createWorkflow.mutateAsync({
        projectId: selectedProjectId,
        name: `workflow-${Date.now()}`,
        label: "New Workflow",
      });
      navigate({ to: `/workflows/${workflow.id}` });
    } catch (err) {
      console.error("Failed to create workflow:", err);
      alert(`Failed to create workflow: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  if (!selectedProjectId) {
    return (
      <div className="p-2">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
          Workflows
        </div>
        <div className="text-sm text-text-muted">Select a project to manage workflows</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="workflows-panel">
      <div className="px-2 py-1 border-b border-border flex items-center justify-between">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Workflows
        </div>
        <button
          onClick={handleCreateWorkflow}
          disabled={createWorkflow.isPending}
          className={cn(
            "p-0.5 rounded hover:bg-bg-elevated transition-colors",
            "text-text-secondary hover:text-text-primary",
            createWorkflow.isPending && "opacity-50"
          )}
          title="New Workflow"
          data-testid="new-workflow-button"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {isLoading ? (
          <div className="px-3 py-2 text-sm text-text-muted">Loading...</div>
        ) : workflows && workflows.length > 0 ? (
          workflows.map((workflow) => (
            <button
              key={workflow.id}
              onClick={() => navigate({ to: `/workflows/${workflow.id}` })}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left",
                "hover:bg-bg-elevated transition-colors",
                "text-sm text-text-primary"
              )}
              data-testid={`workflow-item-${workflow.id}`}
            >
              <Workflow className="w-4 h-4 text-accent-primary shrink-0" />
              <span className="truncate">{workflow.label}</span>
            </button>
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-text-muted" data-testid="no-workflows-message">
            No workflows yet
          </div>
        )}
      </div>
    </div>
  );
}
