import { useNavigate } from "@tanstack/react-router";
import { useCreateProject, useCloneProject, useSettings } from "@/lib/api/queries";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";
import { GitBranch, Folder } from "lucide-react";

interface CreateProjectPageProps {
  params: Record<string, never>;
}

type CreateMode = "local" | "clone";

export default function CreateProjectPage(_props: CreateProjectPageProps) {
  const [mode, setMode] = useState<CreateMode>("local");
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [cloneBranch, setCloneBranch] = useState("");

  const createProject = useCreateProject();
  const cloneProject = useCloneProject();
  const { data: settings } = useSettings();
  const navigate = useNavigate();
  const { openTab, closeTab } = useTabs();
  const { setSelectedProject } = useUI();

  const handleCreateLocal = async () => {
    if (!projectName.trim()) return;

    try {
      const result = await createProject.mutateAsync({
        name: projectName.trim(),
        path: projectPath.trim() || undefined,
      });

      closeTab("create-project");
      setSelectedProject(result.id);
      openTab({
        type: "project",
        projectId: result.id,
        projectName: result.name,
      });

      navigate({
        to: "/projects/$projectId",
        params: { projectId: result.id },
      });
    } catch {
      // Error handling is done by mutation
    }
  };

  const handleClone = async () => {
    if (!repoUrl.trim()) return;

    try {
      const result = await cloneProject.mutateAsync({
        url: repoUrl.trim(),
        name: projectName.trim() || undefined,
        branch: cloneBranch.trim() || undefined,
        ownerId: settings?.userId || "default",
      });

      closeTab("create-project");
      setSelectedProject(result.project.id);
      openTab({
        type: "project",
        projectId: result.project.id,
        projectName: result.project.name,
      });

      navigate({
        to: "/projects/$projectId",
        params: { projectId: result.project.id },
      });
    } catch {
      // Error handling is done by mutation
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "local") {
      await handleCreateLocal();
    } else {
      await handleClone();
    }
  };

  const isPending = createProject.isPending || cloneProject.isPending;
  const error = createProject.error || cloneProject.error;

  return (
    <div className="p-4 sm:p-6 max-w-lg">
      <h1 className="text-2xl font-bold text-text-primary mb-6">
        Create New Project
      </h1>

      {/* Mode selector */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setMode("local")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors",
            mode === "local"
              ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
              : "border-border bg-bg-secondary text-text-secondary hover:border-border/80"
          )}
        >
          <Folder className="w-5 h-5" />
          <span className="font-medium">Local Project</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("clone")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors",
            mode === "clone"
              ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
              : "border-border bg-bg-secondary text-text-secondary hover:border-border/80"
          )}
        >
          <GitBranch className="w-5 h-5" />
          <span className="font-medium">Clone from URL</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "clone" && (
          <>
            <div>
              <label
                htmlFor="repoUrl"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Repository URL
              </label>
              <input
                id="repoUrl"
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git"
                autoFocus
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-bg-secondary border border-border",
                  "text-text-primary placeholder:text-text-muted",
                  "focus:outline-none focus:ring-2 focus:ring-accent-primary"
                )}
              />
              <p className="mt-1 text-xs text-text-muted">
                HTTPS or SSH URL to a Git repository
              </p>
            </div>

            <div>
              <label
                htmlFor="cloneBranch"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Branch (optional)
              </label>
              <input
                id="cloneBranch"
                type="text"
                value={cloneBranch}
                onChange={(e) => setCloneBranch(e.target.value)}
                placeholder="main"
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-bg-secondary border border-border",
                  "text-text-primary placeholder:text-text-muted",
                  "focus:outline-none focus:ring-2 focus:ring-accent-primary"
                )}
              />
              <p className="mt-1 text-xs text-text-muted">
                Leave empty to clone the default branch
              </p>
            </div>
          </>
        )}

        <div>
          <label
            htmlFor="projectName"
            className="block text-sm font-medium text-text-secondary mb-1"
          >
            Project Name{mode === "clone" && " (optional)"}
          </label>
          <input
            id="projectName"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={mode === "clone" ? "Auto-detected from URL" : "My Project"}
            autoFocus={mode === "local"}
            className={cn(
              "w-full px-3 py-2 rounded-lg",
              "bg-bg-secondary border border-border",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-accent-primary"
            )}
          />
          {mode === "clone" && (
            <p className="mt-1 text-xs text-text-muted">
              Leave empty to use the repository name
            </p>
          )}
        </div>

        {mode === "local" && (
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
        )}

        {error && (
          <div className="text-sm text-accent-error">
            {mode === "clone"
              ? "Failed to clone repository. Please check the URL and try again."
              : "Failed to create project. Please try again."}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={
              isPending ||
              (mode === "local" && !projectName.trim()) ||
              (mode === "clone" && !repoUrl.trim())
            }
            className={cn(
              "px-4 py-2 rounded-lg font-medium",
              "bg-accent-primary text-white",
              "hover:bg-accent-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isPending
              ? mode === "clone"
                ? "Cloning..."
                : "Creating..."
              : mode === "clone"
                ? "Clone Repository"
                : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
