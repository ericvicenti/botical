import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCreateProject } from "@/lib/api/queries";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";

export const Route = createFileRoute("/create-project")({
  component: CreateProjectPage,
});

function CreateProjectPage() {
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const createProject = useCreateProject();
  const navigate = useNavigate();
  const { openTab, closeTab } = useTabs();
  const { setSelectedProject } = useUI();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    try {
      const result = await createProject.mutateAsync({
        name: projectName.trim(),
        path: projectPath.trim() || undefined,
      });

      // Close the create-project tab
      closeTab("create-project");

      // Open the new project tab
      setSelectedProject(result.id);
      openTab({
        type: "project",
        projectId: result.id,
        projectName: result.name,
      });

      // Navigate to the new project
      navigate({
        to: "/projects/$projectId",
        params: { projectId: result.id },
      });
    } catch {
      // Error handling is done by mutation
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold text-text-primary mb-6">
        Create New Project
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="projectName"
            className="block text-sm font-medium text-text-secondary mb-1"
          >
            Project Name
          </label>
          <input
            id="projectName"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="My Project"
            autoFocus
            className={cn(
              "w-full px-3 py-2 rounded-lg",
              "bg-bg-secondary border border-border",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-accent-primary"
            )}
          />
        </div>

        <div>
          <label
            htmlFor="projectPath"
            className="block text-sm font-medium text-text-secondary mb-1"
          >
            Project Path (optional)
          </label>
          <input
            id="projectPath"
            type="text"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder="/path/to/project"
            className={cn(
              "w-full px-3 py-2 rounded-lg",
              "bg-bg-secondary border border-border",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-accent-primary"
            )}
          />
          <p className="mt-1 text-xs text-text-muted">
            Leave empty to create a project without a local directory
          </p>
        </div>

        {createProject.error && (
          <div className="text-sm text-accent-error">
            Failed to create project. Please try again.
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={!projectName.trim() || createProject.isPending}
            className={cn(
              "px-4 py-2 rounded-lg font-medium",
              "bg-accent-primary text-white",
              "hover:bg-accent-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {createProject.isPending ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
