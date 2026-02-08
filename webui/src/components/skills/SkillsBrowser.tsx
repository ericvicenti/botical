import { useState } from "react";
import { 
  useSkills, 
  useInstalledSkills,
  useInstallSkill, 
  useUninstallSkill,
  useToggleSkillEnabled 
} from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Code,
  FileText,
  Package,
  Check,
  Download,
  Trash2,
  Search,
  Plus,
  ExternalLink,
  Calendar,
} from "lucide-react";
import type { Skill, InstalledSkill } from "@/lib/api/types";

interface SkillsBrowserProps {
  projectId: string;
}

type SkillsTab = "available" | "installed";

export function SkillsBrowser({ projectId }: SkillsBrowserProps) {
  const [activeTab, setActiveTab] = useState<SkillsTab>("available");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  const { data: projectSkills, isLoading: projectSkillsLoading } = useSkills(projectId);
  const { data: installedSkills, isLoading: installedSkillsLoading } = useInstalledSkills(projectId);
  const installSkill = useInstallSkill();
  const uninstallSkill = useUninstallSkill();
  const toggleSkillEnabled = useToggleSkillEnabled();

  const toggleExpanded = (id: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleInstall = async (repo: string) => {
    try {
      await installSkill.mutateAsync({ projectId, repo });
    } catch (error) {
      console.error("Failed to install skill:", error);
    }
  };

  const handleUninstall = async (repo: string) => {
    try {
      await uninstallSkill.mutateAsync({ projectId, repo });
    } catch (error) {
      console.error("Failed to uninstall skill:", error);
    }
  };

  const handleToggleEnabled = async (repo: string, enabled: boolean) => {
    try {
      await toggleSkillEnabled.mutateAsync({ projectId, repo, enabled });
    } catch (error) {
      console.error("Failed to toggle skill:", error);
    }
  };

  const filteredProjectSkills = projectSkills?.filter(skill =>
    skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredInstalledSkills = installedSkills?.filter(installedSkill =>
    installedSkill.repo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    installedSkill.skills.some(skill => 
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ) || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-bg-tertiary">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-accent-primary" />
          <span className="text-sm font-medium text-text-primary">Skills</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1 text-xs border border-border rounded bg-bg-primary text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-bg-secondary">
        <button
          onClick={() => setActiveTab("available")}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-colors",
            activeTab === "available"
              ? "text-accent-primary border-b-2 border-accent-primary bg-bg-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Available ({filteredProjectSkills.length})
        </button>
        <button
          onClick={() => setActiveTab("installed")}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-colors",
            activeTab === "installed"
              ? "text-accent-primary border-b-2 border-accent-primary bg-bg-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Installed ({filteredInstalledSkills.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "available" ? (
          <AvailableSkillsList
            skills={filteredProjectSkills}
            isLoading={projectSkillsLoading}
            expandedSkills={expandedSkills}
            onToggleExpanded={toggleExpanded}
          />
        ) : (
          <InstalledSkillsList
            skills={filteredInstalledSkills}
            isLoading={installedSkillsLoading}
            expandedSkills={expandedSkills}
            onToggleExpanded={toggleExpanded}
            onUninstall={handleUninstall}
            onToggleEnabled={handleToggleEnabled}
          />
        )}
      </div>

      {/* Install from URL */}
      <div className="px-3 py-2 border-t border-border bg-bg-tertiary">
        <InstallFromUrl onInstall={handleInstall} isInstalling={installSkill.isPending} />
      </div>
    </div>
  );
}

function AvailableSkillsList({
  skills,
  isLoading,
  expandedSkills,
  onToggleExpanded,
}: {
  skills: Skill[];
  isLoading: boolean;
  expandedSkills: Set<string>;
  onToggleExpanded: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="p-4 text-sm text-text-muted">Loading skills...</div>
    );
  }

  if (!skills.length) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-text-muted mb-2">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm">No skills available</span>
        </div>
        <p className="text-xs text-text-muted">
          Add skills to <code className="px-1 py-0.5 bg-bg-tertiary rounded">skills/</code> in your project
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {skills.map((skill) => {
        const isExpanded = expandedSkills.has(skill.name);

        return (
          <div key={skill.name}>
            <div className="flex items-center p-2">
              {/* Expand button */}
              <button
                onClick={() => onToggleExpanded(skill.name)}
                className="p-1 hover:bg-bg-tertiary/50 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-text-muted" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-text-muted" />
                )}
              </button>

              {/* Skill info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Package className="w-3 h-3 text-accent-primary shrink-0" />
                  <span className="text-sm font-medium text-text-primary font-mono truncate">
                    {skill.name}
                  </span>
                </div>
                <p className="text-xs text-text-secondary truncate">{skill.description}</p>
              </div>
            </div>

            {isExpanded && <SkillDetails skill={skill} />}
          </div>
        );
      })}
    </div>
  );
}

function InstalledSkillsList({
  skills,
  isLoading,
  expandedSkills,
  onToggleExpanded,
  onUninstall,
  onToggleEnabled,
}: {
  skills: InstalledSkill[];
  isLoading: boolean;
  expandedSkills: Set<string>;
  onToggleExpanded: (id: string) => void;
  onUninstall: (repo: string) => void;
  onToggleEnabled: (repo: string, enabled: boolean) => void;
}) {
  if (isLoading) {
    return (
      <div className="p-4 text-sm text-text-muted">Loading installed skills...</div>
    );
  }

  if (!skills.length) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-text-muted mb-2">
          <Package className="w-4 h-4" />
          <span className="text-sm">No skills installed</span>
        </div>
        <p className="text-xs text-text-muted">
          Install skills from GitHub repositories below
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {skills.map((installedSkill) => {
        const isExpanded = expandedSkills.has(installedSkill.repo);

        return (
          <div key={installedSkill.repo}>
            <div className="flex items-center p-2">
              {/* Toggle enabled */}
              <label className="flex items-center justify-center w-8 cursor-pointer">
                <input
                  type="checkbox"
                  checked={installedSkill.enabled}
                  onChange={(e) => onToggleEnabled(installedSkill.repo, e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={cn(
                    "w-3 h-3 rounded border flex items-center justify-center transition-colors",
                    installedSkill.enabled
                      ? "bg-accent-primary border-accent-primary"
                      : "border-border hover:border-text-muted"
                  )}
                >
                  {installedSkill.enabled && <Check className="w-2 h-2 text-white" />}
                </div>
              </label>

              {/* Expand button */}
              <button
                onClick={() => onToggleExpanded(installedSkill.repo)}
                className="p-1 hover:bg-bg-tertiary/50 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-text-muted" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-text-muted" />
                )}
              </button>

              {/* Repository info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Package className="w-3 h-3 text-accent-primary shrink-0" />
                  <span className="text-sm font-medium text-text-primary font-mono truncate">
                    {installedSkill.repo}
                  </span>
                  {installedSkill.ref && (
                    <span className="text-xs text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">
                      {installedSkill.ref}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary">
                  {installedSkill.skills.length} skill{installedSkill.skills.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Uninstall button */}
              <button
                onClick={() => onUninstall(installedSkill.repo)}
                className="p-1 hover:bg-red-500/10 hover:text-red-500 text-text-muted rounded"
                title="Uninstall repository"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            {isExpanded && <InstalledSkillDetails skill={installedSkill} />}
          </div>
        );
      })}
    </div>
  );
}

function SkillDetails({ skill }: { skill: Skill }) {
  return (
    <div className="px-3 pb-3 ml-8 space-y-2">
      {skill.allowedTools && skill.allowedTools.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Code className="w-3 h-3 text-text-muted" />
          <span className="text-xs text-text-muted">Tools:</span>
          {skill.allowedTools.map((tool) => (
            <span
              key={tool}
              className="px-1.5 py-0.5 text-xs bg-bg-tertiary rounded text-text-secondary font-mono"
            >
              {tool}
            </span>
          ))}
        </div>
      )}

      {skill.license && (
        <div className="flex items-center gap-1 text-xs text-text-muted">
          <FileText className="w-3 h-3" />
          <span>License: {skill.license}</span>
        </div>
      )}
    </div>
  );
}

function InstalledSkillDetails({ skill }: { skill: InstalledSkill }) {
  return (
    <div className="px-3 pb-3 ml-8 space-y-3">
      <div className="flex items-center gap-1 text-xs text-text-muted">
        <Calendar className="w-3 h-3" />
        <span>Installed: {new Date(skill.installedAt).toLocaleDateString()}</span>
      </div>

      <div className="flex items-center gap-1 text-xs">
        <ExternalLink className="w-3 h-3 text-text-muted" />
        <a
          href={`https://github.com/${skill.repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-primary hover:underline"
        >
          View Repository
        </a>
      </div>

      {/* List individual skills in this repository */}
      {skill.skills.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-text-muted">Skills:</span>
          {skill.skills.map((individualSkill) => (
            <div key={individualSkill.name} className="ml-2 p-2 border border-border rounded bg-bg-secondary">
              <div className="flex items-center gap-1">
                <Package className="w-3 h-3 text-accent-primary" />
                <span className="text-xs font-medium text-text-primary font-mono">
                  {individualSkill.name}
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-1">{individualSkill.description}</p>
              {individualSkill.allowedTools && individualSkill.allowedTools.length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <Code className="w-2 h-2 text-text-muted" />
                  {individualSkill.allowedTools.map((tool) => (
                    <span
                      key={tool}
                      className="px-1 py-0.5 text-xs bg-bg-tertiary rounded text-text-secondary font-mono"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InstallFromUrl({ onInstall, isInstalling }: { 
  onInstall: (repo: string) => void; 
  isInstalling: boolean;
}) {
  const [repo, setRepo] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (repo.trim()) {
      // Extract repo name from URL or use as-is if already in owner/repo format
      let repoName = repo.trim();
      const githubUrlMatch = repoName.match(/github\.com\/([^\/]+\/[^\/]+)/);
      if (githubUrlMatch) {
        repoName = githubUrlMatch[1];
      }
      onInstall(repoName);
      setRepo("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-1 text-xs text-text-muted">
        <Plus className="w-3 h-3" />
        <span>Install from GitHub</span>
      </div>
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="user/repo or https://github.com/user/repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          disabled={isInstalling}
          className="flex-1 px-2 py-1 text-xs border border-border rounded bg-bg-primary text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!repo.trim() || isInstalling}
          className="px-2 py-1 text-xs bg-accent-primary text-white rounded hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Download className="w-3 h-3" />
          {isInstalling ? "Installing..." : "Install"}
        </button>
      </div>
    </form>
  );
}