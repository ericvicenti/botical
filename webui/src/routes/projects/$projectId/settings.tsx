import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useProject, useUpdateProject } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import {
  ChevronDown,
  ChevronRight,
  Settings,
  FolderCog,
  ArrowLeft,
  Info,
  X,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { GitIdentity } from "@/components/git";

export const Route = createFileRoute("/projects/$projectId/settings")({
  component: ProjectSettingsPage,
});

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 bg-bg-elevated hover:bg-bg-secondary transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-muted" />
        )}
        <span className="text-text-muted">{icon}</span>
        <span className="font-medium text-text-primary">{title}</span>
        {badge && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary">
            {badge}
          </span>
        )}
      </button>
      {isOpen && <div className="p-4 border-t border-border">{children}</div>}
    </div>
  );
}

function ProjectSettingsPage() {
  const { projectId } = Route.useParams();
  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject();
  const { updateTabLabel } = useTabs();

  const [name, setName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize name when project loads
  useEffect(() => {
    if (project?.name && name === null) {
      setName(project.name);
    }
  }, [project?.name, name]);

  const hasNameChanged = name !== null && name !== project?.name;
  const canSave = hasNameChanged && name.trim().length > 0;

  const handleSaveName = async () => {
    if (!canSave) return;

    setIsSaving(true);
    try {
      const newName = name.trim();
      await updateProject.mutateAsync({ id: projectId, name: newName });
      // Update the tab label to reflect the new project name
      updateTabLabel(`project-settings:${projectId}`, `${newName} Settings`);
    } catch (err) {
      console.error("Failed to update project name:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelName = () => {
    setName(project?.name || "");
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-bg-elevated rounded animate-pulse mb-6" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-bg-elevated rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <div className="bg-accent-error/10 border border-accent-error/20 rounded-lg p-4">
          <h2 className="text-accent-error font-medium">Project not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="text-sm text-text-muted hover:text-text-secondary mb-2 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to {project.name}
        </Link>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
          <Settings className="w-6 h-6 text-text-muted" />
          Project Settings
        </h1>
      </div>

      <div className="space-y-4">
        {/* Project Section */}
        <CollapsibleSection
          title="Info"
          icon={<Info className="w-4 h-4" />}
        >
          <div className="space-y-4">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Name
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={name ?? project.name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  placeholder="Project name"
                />
                {hasNameChanged && (
                  <>
                    <button
                      onClick={handleSaveName}
                      disabled={isSaving || !canSave}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                        isSaving || !canSave
                          ? "text-text-muted cursor-not-allowed"
                          : "text-accent-primary hover:bg-accent-primary/10"
                      )}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={handleCancelName}
                      className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                      title="Cancel changes"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Project Icon */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Icon
              </label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-bg-elevated rounded-lg flex items-center justify-center text-2xl border border-border overflow-hidden">
                  {project.iconUrl ? (
                    <img src={project.iconUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-text-muted text-lg">📁</span>
                  )}
                </div>
                <span className="text-sm text-text-muted">Icon customization coming soon</span>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Data Section */}
        <CollapsibleSection
          title="Data"
          icon={<FolderCog className="w-4 h-4" />}
        >
          <div className="space-y-4">
            {/* Project Path */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Location
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={project.path || ""}
                  readOnly
                  className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-muted font-mono text-sm"
                  placeholder="No path set"
                />
                <button className="px-3 py-2 bg-bg-elevated border border-border rounded-lg text-text-secondary hover:bg-bg-secondary transition-colors text-sm">
                  Change
                </button>
              </div>
              <p className="text-xs text-text-muted mt-2">
                The filesystem path where project files are stored
              </p>
            </div>

            {/* Project ID */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Project ID
              </label>
              <input
                type="text"
                value={project.id}
                readOnly
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-muted font-mono text-sm"
              />
              <p className="text-xs text-text-muted mt-2">
                Unique identifier for this project
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Git Section */}
        <CollapsibleSection
          title="Git"
          icon={<GitBranch className="w-4 h-4" />}
        >
          <GitIdentity />
        </CollapsibleSection>

        {/* Danger Zone */}
        <CollapsibleSection
          title="Danger Zone"
          icon={<Settings className="w-4 h-4 text-accent-error" />}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <div className="p-4 bg-accent-error/10 border border-accent-error/20 rounded-lg">
              <h4 className="font-medium text-accent-error mb-2">Delete Project</h4>
              <p className="text-sm text-text-secondary mb-3">
                Permanently delete this project and all associated data. This action cannot be undone.
              </p>
              <button className="px-4 py-2 bg-accent-error text-white rounded-lg hover:bg-accent-error/90 transition-colors text-sm font-medium">
                Delete Project
              </button>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
