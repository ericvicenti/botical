import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useProjects } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { data: projects, isLoading, error } = useProjects();
  const { openTab } = useTabs();
  const navigate = useNavigate();
  const { setSelectedProject } = useUI();

  // Open the projects tab when this page loads
  useEffect(() => {
    openTab({ type: "projects" });
  }, [openTab]);

  const handleProjectClick = (project: { id: string; name: string }) => {
    setSelectedProject(project.id);
    openTab({
      type: "project",
      projectId: project.id,
      projectName: project.name,
    });
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-accent-error/10 border border-accent-error/20 rounded-lg p-4">
          <h2 className="text-accent-error font-medium">
            Failed to load projects
          </h2>
          <p className="text-text-secondary text-sm mt-1">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-bg-elevated rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : projects?.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-secondary">No projects yet</p>
          <p className="text-text-muted text-sm mt-1">
            Use the project selector in the sidebar to create your first project
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects?.map((project) => (
            <button
              key={project.id}
              onClick={() => handleProjectClick(project)}
              className={cn(
                "block w-full text-left p-4 bg-bg-elevated rounded-lg border border-border",
                "hover:border-accent-primary/50 hover:bg-bg-elevated/80 transition-colors"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-text-primary">
                    {project.name}
                  </h3>
                  {project.path && (
                    <p className="text-sm text-text-muted font-mono mt-1">
                      {project.path}
                    </p>
                  )}
                  {project.description && (
                    <p className="text-sm text-text-secondary mt-2">
                      {project.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(project.createdAt).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
