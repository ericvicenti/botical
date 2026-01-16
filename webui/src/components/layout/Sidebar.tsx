import { useUI } from "@/contexts/ui";
import { cn } from "@/lib/utils/cn";
import { FolderTree, Files, GitBranch, Play } from "lucide-react";
import { useProjects, useMissions } from "@/lib/api/queries";
import { useNavigate } from "@tanstack/react-router";
import { useTabs } from "@/contexts/tabs";

const PANELS = [
  { id: "nav", icon: FolderTree, label: "Navigator" },
  { id: "files", icon: Files, label: "Files" },
  { id: "git", icon: GitBranch, label: "Git" },
  { id: "run", icon: Play, label: "Run" },
] as const;

export function Sidebar() {
  const { sidebarCollapsed, sidebarPanel, setSidebarPanel, toggleSidebar } =
    useUI();

  if (sidebarCollapsed) {
    return (
      <div className="w-12 bg-bg-secondary border-r border-border flex flex-col">
        {PANELS.map((panel) => (
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
        ))}
      </div>
    );
  }

  return (
    <div className="w-60 bg-bg-secondary border-r border-border flex">
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
      </div>

      <div className="flex-1 overflow-hidden">
        <SidebarPanel panel={sidebarPanel} />
      </div>
    </div>
  );
}

function SidebarPanel({ panel }: { panel: string }) {
  switch (panel) {
    case "nav":
      return <NavigatorPanel />;
    case "files":
      return <FilesPanel />;
    case "git":
      return <GitPanel />;
    case "run":
      return <RunPanel />;
    default:
      return null;
  }
}

function NavigatorPanel() {
  const { data: projects, isLoading } = useProjects();

  return (
    <div className="p-2 overflow-auto h-full">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Projects
      </div>
      {isLoading ? (
        <div className="text-sm text-text-muted">Loading...</div>
      ) : !projects?.length ? (
        <div className="text-sm text-text-muted">No projects</div>
      ) : (
        <div className="space-y-1">
          {projects.map((project) => (
            <ProjectItem key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectItem({
  project,
}: {
  project: { id: string; name: string; path?: string | null };
}) {
  const { data: missions } = useMissions(project.id);
  const { openTab } = useTabs();
  const navigate = useNavigate();

  const handleClick = () => {
    openTab({
      type: "project",
      projectId: project.id,
      projectName: project.name,
    });
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-elevated text-sm text-text-primary w-full text-left"
      >
        <FolderTree className="w-4 h-4 text-accent-primary shrink-0" />
        <span className="truncate">{project.name}</span>
      </button>
      {missions && missions.length > 0 && (
        <div className="ml-4 mt-1 space-y-0.5">
          {missions.slice(0, 5).map((mission) => (
            <div
              key={mission.id}
              className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-bg-elevated text-xs text-text-secondary"
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  mission.status === "running"
                    ? "bg-accent-success"
                    : mission.status === "planning"
                      ? "bg-accent-warning"
                      : "bg-text-muted"
                )}
              />
              <span className="truncate">{mission.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilesPanel() {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Files
      </div>
      <div className="text-sm text-text-muted">Select a project to browse files</div>
    </div>
  );
}

function GitPanel() {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Source Control
      </div>
      <div className="text-sm text-text-muted">Git integration coming soon</div>
    </div>
  );
}

function RunPanel() {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Commands & Services
      </div>
      <div className="text-sm text-text-muted">No running processes</div>
    </div>
  );
}
