import { useState } from "react";
import { useSkills } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Code,
  FileText,
  Package,
  Check,
} from "lucide-react";
import type { Skill } from "@/lib/api/types";

interface SkillsPanelProps {
  projectId: string;
  enabledSkills: Set<string>;
  loadedSkills: Set<string>;
  onToggleSkill: (skillName: string, enabled: boolean) => void;
  onOpenSkillFile: (skill: Skill) => void;
}

export function SkillsPanel({
  projectId,
  enabledSkills,
  loadedSkills,
  onToggleSkill,
  onOpenSkillFile,
}: SkillsPanelProps) {
  const { data: skills, isLoading } = useSkills(projectId);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  const toggleExpanded = (name: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-text-muted">Loading skills...</div>
    );
  }

  if (!skills?.length) {
    return (
      <div className="bg-bg-secondary p-4">
        <div className="flex items-center gap-2 text-text-muted">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm">No skills available</span>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Add skills to <code className="px-1 py-0.5 bg-bg-tertiary rounded">skills/</code> in your project
        </p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary overflow-hidden max-h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-bg-tertiary flex items-center gap-2 shrink-0">
        <Sparkles className="w-4 h-4 text-accent-primary" />
        <span className="text-sm font-medium text-text-primary">Skills</span>
        <span className="text-xs text-text-muted ml-auto">
          {skills.length} available
        </span>
      </div>

      {/* Skills list */}
      <div className="divide-y divide-border overflow-y-auto flex-1">
        {skills.map((skill) => {
          const isExpanded = expandedSkills.has(skill.name);
          const isLoaded = loadedSkills.has(skill.name);
          const isEnabled = enabledSkills.has(skill.name) || isLoaded;

          return (
            <div key={skill.name}>
              <div className="flex items-center">
                {/* Checkbox */}
                <label
                  className={cn(
                    "flex items-center justify-center w-10 h-10 cursor-pointer",
                    isLoaded && "cursor-not-allowed opacity-60"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={isLoaded}
                    onChange={(e) => onToggleSkill(skill.name, e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      isEnabled
                        ? "bg-accent-primary border-accent-primary"
                        : "border-border hover:border-text-muted"
                    )}
                  >
                    {isEnabled && <Check className="w-3 h-3 text-white" />}
                  </div>
                </label>

                {/* Expand/collapse button */}
                <button
                  onClick={() => toggleExpanded(skill.name)}
                  className="p-2 hover:bg-bg-tertiary/50 transition-colors rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-text-muted" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  )}
                </button>

                {/* Skill name - clickable to open file */}
                <button
                  onClick={() => onOpenSkillFile(skill)}
                  className="flex-1 flex items-center gap-2 py-2 pr-3 hover:bg-bg-tertiary/50 transition-colors text-left"
                  title="Open SKILL.md"
                >
                  <Package className="w-4 h-4 text-accent-primary" />
                  <span className="text-sm font-medium text-text-primary font-mono hover:underline">
                    {skill.name}
                  </span>
                  {isLoaded && (
                    <span className="text-xs text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">
                      loaded
                    </span>
                  )}
                </button>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 ml-10 space-y-2">
                  <p className="text-xs text-text-secondary">
                    {skill.description}
                  </p>

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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
