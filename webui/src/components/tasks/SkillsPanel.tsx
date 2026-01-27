import { useState } from "react";
import { useSkills } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Code,
  FileText,
  Package,
} from "lucide-react";
import type { Skill } from "@/lib/api/types";

interface SkillsPanelProps {
  projectId: string;
  onSelectSkill?: (skill: Skill) => void;
}

export function SkillsPanel({ projectId, onSelectSkill }: SkillsPanelProps) {
  const { data: skills, isLoading, error } = useSkills(projectId);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  const toggleSkill = (name: string) => {
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
      <div className="border border-border rounded-lg bg-bg-secondary p-4">
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
    <div className="border border-border rounded-lg bg-bg-secondary overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-bg-tertiary flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent-primary" />
        <span className="text-sm font-medium text-text-primary">Skills</span>
        <span className="text-xs text-text-muted ml-auto">
          {skills.length} available
        </span>
      </div>

      {/* Skills list */}
      <div className="divide-y divide-border">
        {skills.map((skill) => {
          const isExpanded = expandedSkills.has(skill.name);

          return (
            <div key={skill.name}>
              <button
                onClick={() => toggleSkill(skill.name)}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-bg-tertiary/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-text-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                )}
                <Package className="w-4 h-4 text-accent-primary" />
                <span className="flex-1 text-left text-sm font-medium text-text-primary font-mono">
                  {skill.name}
                </span>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 ml-6 space-y-2">
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

                  {onSelectSkill && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSkill(skill);
                      }}
                      className="flex items-center gap-1 text-xs text-accent-primary hover:underline"
                    >
                      <BookOpen className="w-3 h-3" />
                      Use this skill
                    </button>
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
