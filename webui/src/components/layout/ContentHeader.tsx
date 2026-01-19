import { FolderTree, ExternalLink } from "lucide-react";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";

interface ContentHeaderProps {
  project?: { id: string; name: string } | null;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode; // For action buttons on the right
}

export function ContentHeader({ project, title, subtitle, children }: ContentHeaderProps) {
  const { openTab } = useTabs();
  const navigate = useNavigate();

  const handleOpenProject = () => {
    if (!project) return;
    openTab({
      type: "project",
      projectId: project.id,
      projectName: project.name,
    });
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  return (
    <div className="px-4 py-3 border-b border-border bg-bg-secondary flex items-center justify-between">
      <div className="min-w-0 flex-1">
        {/* Project link */}
        {project && (
          <button
            onClick={handleOpenProject}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-primary mb-1 transition-colors group"
          >
            <FolderTree className="w-3 h-3" />
            <span>{project.name}</span>
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        <h2 className="text-lg font-medium text-text-primary truncate">
          {title}
        </h2>
        {subtitle && (
          <div className="text-sm text-text-muted">
            {subtitle}
          </div>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-1 shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
