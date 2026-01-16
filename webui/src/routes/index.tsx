import { createFileRoute, Link } from "@tanstack/react-router";
import { useProjects, useCreateProject } from "@/lib/api/queries";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { data: projects, isLoading, error } = useProjects();
  const createProject = useCreateProject();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      await createProject.mutateAsync({
        name: newProjectName.trim(),
        path: newProjectPath.trim() || undefined,
      });
      setNewProjectName("");
      setNewProjectPath("");
      setShowNewProject(false);
    } catch (err) {
      console.error("Failed to create project:", err);
    }
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
        <button
          onClick={() => setShowNewProject(true)}
          className="px-4 py-2 bg-accent-primary text-bg-primary font-medium rounded-lg hover:bg-accent-primary/90 transition-colors"
        >
          New Project
        </button>
      </div>

      {showNewProject && (
        <div className="mb-6 p-4 bg-bg-elevated rounded-lg border border-border">
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                Project Name
              </label>
              <input
                id="name"
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="My Project"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                autoFocus
              />
            </div>
            <div>
              <label
                htmlFor="path"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                Path (optional)
              </label>
              <input
                id="path"
                type="text"
                value={newProjectPath}
                onChange={(e) => setNewProjectPath(e.target.value)}
                placeholder="/path/to/project"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createProject.isPending || !newProjectName.trim()}
                className="px-4 py-2 bg-accent-primary text-bg-primary font-medium rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
              >
                {createProject.isPending ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewProject(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

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
            Create your first project to get started
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects?.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className={cn(
                "block p-4 bg-bg-elevated rounded-lg border border-border",
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
