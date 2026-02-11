import { Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProject, useUpdateProject, useInstalledSkills, useInstallSkill, useUninstallSkill, useToggleSkillEnabled, useSkills } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { apiClient } from "@/lib/api/client";
import {
  ChevronDown,
  ChevronRight,
  Settings,
  FolderCog,
  ArrowLeft,
  Info,
  X,
  GitBranch,
  Wand2,
  Trash2,
  Loader2,
  ExternalLink,
  Search,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { GitIdentity } from "@/components/git";
import type { InstalledSkill } from "@/lib/api/types";

interface ProjectSettingsPageProps {
  params: {
    projectId: string;
    projectName?: string;
  };
}

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

interface InstalledSkillCardProps {
  installed: InstalledSkill;
  projectId: string;
  onToggle: (enabled: boolean) => void;
  onUninstall: () => void;
}

function InstalledSkillCard({ installed, onToggle, onUninstall }: InstalledSkillCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-3 bg-bg-elevated">
        {/* Expand/collapse */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Enable/disable toggle */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={installed.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-bg-primary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-muted peer-checked:after:bg-accent-primary after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-primary/20 border border-border"></div>
        </label>

        {/* Repo name */}
        <div className="flex-1 min-w-0">
          <a
            href={`https://github.com/${installed.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-text-primary hover:text-accent-primary transition-colors inline-flex items-center gap-1"
          >
            {installed.repo}
            <ExternalLink className="w-3 h-3" />
          </a>
          {installed.ref && (
            <span className="ml-2 text-xs text-text-muted">@{installed.ref}</span>
          )}
        </div>

        {/* Skills count badge */}
        <span className="text-xs px-2 py-0.5 rounded-full bg-bg-primary text-text-muted">
          {installed.skills.length} skill{installed.skills.length !== 1 ? "s" : ""}
        </span>

        {/* Uninstall button */}
        <button
          onClick={onUninstall}
          className="p-1.5 text-text-muted hover:text-accent-error hover:bg-accent-error/10 rounded transition-colors"
          title="Uninstall"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && installed.skills.length > 0 && (
        <div className="border-t border-border p-3 bg-bg-primary space-y-1">
          {installed.skills.map((skill) => (
            <div
              key={skill.name}
              className="flex items-start gap-2 text-sm py-1"
            >
              <Wand2 className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-text-primary">{skill.name}</span>
                <p className="text-text-muted text-xs">{skill.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { projectId } = params;
  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject();
  const { updateTabLabel, closeTab } = useTabs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ title: string; message: string } | null>(null);

  // Skills state
  const [skillRepoInput, setSkillRepoInput] = useState("");
  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [skillSearchResults, setSkillSearchResults] = useState<Array<{
    id: string;
    name: string;
    installs: number;
    topSource: string;
  }> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [installingRepo, setInstallingRepo] = useState<string | null>(null);
  const { data: installedSkills, isLoading: isLoadingInstalled } = useInstalledSkills(projectId);
  const { data: allSkills } = useSkills(projectId);
  const installSkill = useInstallSkill();
  const uninstallSkill = useUninstallSkill();
  const toggleSkillEnabled = useToggleSkillEnabled();

  const handleSearchSkills = async () => {
    if (!skillSearchQuery.trim()) return;
    setIsSearching(true);
    try {
      // Use our backend proxy to avoid CORS issues
      const response = await fetch(
        `/api/skills/search?q=${encodeURIComponent(skillSearchQuery.trim())}`
      );
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      const data = await response.json();
      setSkillSearchResults(data.data || []);
    } catch (err) {
      console.error("Failed to search skills:", err);
      alert(`Failed to search: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInstallFromSearch = async (repo: string) => {
    setInstallingRepo(repo);
    try {
      await installSkill.mutateAsync({ projectId, repo });
    } catch (err) {
      console.error("Failed to install skill:", err);
      alert(`Failed to install: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setInstallingRepo(null);
    }
  };

  const isRepoInstalled = (repo: string) => {
    return installedSkills?.some((s) => s.repo === repo) || false;
  };

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

  const handleDeleteProject = async () => {
    if (!confirm(`Are you sure you want to delete "${project?.name}"? The project will be archived.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await apiClient<{
        type: string;
        title?: string;
        output?: string;
        message?: string;
      }>("/api/tools/actions/execute", {
        method: "POST",
        body: JSON.stringify({
          actionId: "project.delete",
          params: { projectId },
        }),
      });

      if (result.type === "success") {
        setDeleteResult({
          title: result.title || "Project Archived",
          message: result.output || "Project has been archived.",
        });
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        closeTab(`project-settings:${projectId}`);
        setTimeout(() => {
          navigate({ to: "/" });
        }, 100);
      } else if (result.type === "error") {
        alert(`Failed to delete project: ${result.message}`);
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
      alert(`Failed to delete project: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsDeleting(false);
    }
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
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
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
                    <span className="text-text-muted text-lg">{"\u{1F4C1}"}</span>
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

        {/* Skills Section */}
        <CollapsibleSection
          title="Skills"
          icon={<Wand2 className="w-4 h-4" />}
          badge={installedSkills?.length ? `${installedSkills.length}` : undefined}
        >
          <div className="space-y-6">
            {/* Search for Skills */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Find Skills
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={skillSearchQuery}
                    onChange={(e) => setSkillSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchSkills()}
                    placeholder="Search for skills..."
                    className="w-full pl-9 pr-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 text-sm"
                  />
                </div>
                <button
                  onClick={handleSearchSkills}
                  disabled={isSearching || !skillSearchQuery.trim()}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isSearching || !skillSearchQuery.trim()
                      ? "bg-bg-elevated text-text-muted cursor-not-allowed"
                      : "bg-accent-primary text-white hover:bg-accent-primary/90"
                  )}
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Search"
                  )}
                </button>
              </div>
              <p className="text-xs text-text-muted mt-2">
                Search the{" "}
                <a
                  href="https://skills.sh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  skills.sh
                </a>{" "}
                directory for community skills.
              </p>

              {/* Search Results */}
              {skillSearchResults !== null && (
                <div className="mt-3 border border-border rounded-lg overflow-hidden">
                  {skillSearchResults.length === 0 ? (
                    <div className="px-4 py-6 text-center text-text-muted text-sm">
                      No skills found for "{skillSearchQuery}"
                    </div>
                  ) : (
                    <div className="divide-y divide-border max-h-64 overflow-auto">
                      {skillSearchResults.map((skill) => {
                        const installed = isRepoInstalled(skill.topSource);
                        const installing = installingRepo === skill.topSource;
                        return (
                          <div
                            key={skill.id}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-elevated/50"
                          >
                            <Wand2 className="w-4 h-4 text-accent-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-text-primary text-sm truncate">
                                {skill.name}
                              </div>
                              <div className="text-xs text-text-muted truncate">
                                {skill.topSource} • {skill.installs.toLocaleString()} installs
                              </div>
                            </div>
                            <button
                              onClick={() => handleInstallFromSearch(skill.topSource)}
                              disabled={installed || installing}
                              className={cn(
                                "px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5",
                                installed
                                  ? "bg-green-500/10 text-green-500 cursor-default"
                                  : installing
                                    ? "bg-bg-elevated text-text-muted cursor-not-allowed"
                                    : "bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20"
                              )}
                            >
                              {installed ? (
                                "Installed"
                              ) : installing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <Download className="w-3 h-3" />
                                  Install
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button
                    onClick={() => setSkillSearchResults(null)}
                    className="w-full px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors border-t border-border"
                  >
                    Close search results
                  </button>
                </div>
              )}
            </div>

            {/* Install from GitHub */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Install from GitHub
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillRepoInput}
                  onChange={(e) => setSkillRepoInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && skillRepoInput.match(/^[\w.-]+\/[\w.-]+$/) && !installSkill.isPending) {
                      try {
                        await installSkill.mutateAsync({
                          projectId,
                          repo: skillRepoInput,
                        });
                        setSkillRepoInput("");
                      } catch (err) {
                        console.error("Failed to install skill:", err);
                        alert(`Failed to install skill: ${err instanceof Error ? err.message : "Unknown error"}`);
                      }
                    }
                  }}
                  placeholder="owner/repo (e.g., anthropics/skills)"
                  className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 font-mono text-sm"
                />
                <button
                  onClick={async () => {
                    if (!skillRepoInput.match(/^[\w.-]+\/[\w.-]+$/)) return;
                    try {
                      await installSkill.mutateAsync({
                        projectId,
                        repo: skillRepoInput,
                      });
                      setSkillRepoInput("");
                    } catch (err) {
                      console.error("Failed to install skill:", err);
                      alert(`Failed to install skill: ${err instanceof Error ? err.message : "Unknown error"}`);
                    }
                  }}
                  disabled={installSkill.isPending || !skillRepoInput.match(/^[\w.-]+\/[\w.-]+$/)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    installSkill.isPending || !skillRepoInput.match(/^[\w.-]+\/[\w.-]+$/)
                      ? "bg-bg-elevated text-text-muted cursor-not-allowed"
                      : "bg-accent-primary text-white hover:bg-accent-primary/90"
                  )}
                >
                  {installSkill.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Install"
                  )}
                </button>
              </div>
              <p className="text-xs text-text-muted mt-2">
                Install skills from a public GitHub repository containing SKILL.md files.
                <a
                  href="https://agentskills.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline ml-1 inline-flex items-center gap-1"
                >
                  Learn more <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>

            {/* Installed Skills */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Installed Skills
              </label>
              {isLoadingInstalled ? (
                <div className="flex items-center gap-2 text-text-muted text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : installedSkills?.length === 0 ? (
                <p className="text-sm text-text-muted py-2">
                  No skills installed yet. Install skills from GitHub to extend agent capabilities.
                </p>
              ) : (
                <div className="space-y-2">
                  {installedSkills?.map((installed) => (
                    <InstalledSkillCard
                      key={installed.repo}
                      installed={installed}
                      projectId={projectId}
                      onToggle={(enabled) => {
                        toggleSkillEnabled.mutate(
                          { projectId, repo: installed.repo, enabled },
                          {
                            onError: (err) => {
                              console.error("Failed to toggle skill:", err);
                              alert(`Failed to toggle skill: ${err.message}`);
                            },
                          }
                        );
                      }}
                      onUninstall={() => {
                        if (!confirm(`Uninstall skills from ${installed.repo}?`)) return;
                        uninstallSkill.mutate(
                          { projectId, repo: installed.repo },
                          {
                            onError: (err) => {
                              console.error("Failed to uninstall skill:", err);
                              alert(`Failed to uninstall: ${err.message}`);
                            },
                          }
                        );
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Local Skills */}
            {allSkills && allSkills.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  All Available Skills
                </label>
                <p className="text-xs text-text-muted mb-2">
                  Skills available to agents (from installed repos and local skills/ directory)
                </p>
                <div className="space-y-1">
                  {allSkills.map((skill) => (
                    <div
                      key={skill.name}
                      className="flex items-center gap-2 px-3 py-2 bg-bg-elevated rounded-lg text-sm"
                    >
                      <Wand2 className="w-4 h-4 text-accent-primary shrink-0" />
                      <span className="font-medium text-text-primary">{skill.name}</span>
                      <span className="text-text-muted truncate">- {skill.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                Archive this project. The project data will remain on disk and can be manually deleted if needed.
              </p>
              <button
                onClick={handleDeleteProject}
                disabled={isDeleting}
                className={cn(
                  "px-4 py-2 bg-accent-error text-white rounded-lg transition-colors text-sm font-medium",
                  isDeleting
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-accent-error/90"
                )}
              >
                {isDeleting ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </CollapsibleSection>

        {/* Delete Result Dialog */}
        {deleteResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-bg-primary border border-border rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                {deleteResult.title}
              </h3>
              <p className="text-sm text-text-secondary whitespace-pre-wrap mb-6">
                {deleteResult.message}
              </p>
              <button
                onClick={() => {
                  setDeleteResult(null);
                  navigate({ to: "/" });
                }}
                className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors text-sm font-medium"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
