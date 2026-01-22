import { useState } from "react";
import { useCoreTools } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import {
  Wrench,
  FileText,
  Terminal,
  Search,
  Bot,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ToolCategory } from "@/lib/api/types";

interface ToolsPanelProps {
  enabledTools: Set<string>;
  onToggleTool: (toolName: string) => void;
}

const CATEGORY_INFO: Record<ToolCategory, { label: string; icon: typeof Wrench; description: string }> = {
  filesystem: {
    label: "Filesystem",
    icon: FileText,
    description: "Read, write, and edit files",
  },
  execution: {
    label: "Execution",
    icon: Terminal,
    description: "Run commands and manage services",
  },
  search: {
    label: "Search",
    icon: Search,
    description: "Find files and search code",
  },
  agent: {
    label: "Agent",
    icon: Bot,
    description: "Spawn sub-agents for tasks",
  },
  action: {
    label: "Actions",
    icon: Zap,
    description: "Execute registered actions",
  },
  other: {
    label: "Other",
    icon: Wrench,
    description: "Miscellaneous tools",
  },
};

export function ToolsPanel({
  enabledTools,
  onToggleTool,
}: ToolsPanelProps) {
  const { data: coreTools, isLoading } = useCoreTools();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["filesystem", "search", "execution", "action"])
  );

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-text-muted">
        Loading tools...
      </div>
    );
  }

  // Group tools by category
  const toolsByCategory = new Map<ToolCategory, typeof coreTools>();
  for (const tool of coreTools || []) {
    const category = tool.category;
    if (!toolsByCategory.has(category)) {
      toolsByCategory.set(category, []);
    }
    toolsByCategory.get(category)!.push(tool);
  }

  // Sort categories in a logical order
  const categoryOrder: ToolCategory[] = ["filesystem", "search", "execution", "agent", "action", "other"];
  const sortedCategories = categoryOrder.filter((c) => toolsByCategory.has(c));

  return (
    <div className="border border-border rounded-lg bg-bg-secondary overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-bg-tertiary flex items-center gap-2">
        <Wrench className="w-4 h-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">Agent Tools</span>
        <span className="text-xs text-text-muted ml-auto">
          {enabledTools.size} enabled
        </span>
      </div>

      {/* Tool categories */}
      <div className="divide-y divide-border">
        {sortedCategories.map((category) => {
          const info = CATEGORY_INFO[category];
          const tools = toolsByCategory.get(category) || [];
          const isExpanded = expandedCategories.has(category);
          const enabledCount = tools.filter((t) => enabledTools.has(t.name)).length;
          const Icon = info.icon;

          return (
            <div key={category}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-bg-tertiary/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-text-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                )}
                <Icon className="w-4 h-4 text-text-secondary" />
                <span className="flex-1 text-left text-sm font-medium text-text-primary">
                  {info.label}
                </span>
                <span className="text-xs text-text-muted">
                  {enabledCount}/{tools.length}
                </span>
              </button>

              {/* Tools in category */}
              {isExpanded && (
                <div className="px-3 pb-2 space-y-1">
                  {tools.map((tool) => {
                    const isEnabled = enabledTools.has(tool.name);

                    return (
                      <button
                        key={tool.name}
                        onClick={() => onToggleTool(tool.name)}
                        className={cn(
                          "w-full px-2 py-1.5 rounded text-left flex items-start gap-2 transition-colors",
                          isEnabled
                            ? "bg-accent-primary/10 hover:bg-accent-primary/20"
                            : "hover:bg-bg-tertiary"
                        )}
                        title={tool.description}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5",
                            isEnabled
                              ? "border-accent-primary bg-accent-primary"
                              : "border-border"
                          )}
                        >
                          {isEnabled && (
                            <svg
                              className="w-2.5 h-2.5 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              "text-sm font-mono",
                              isEnabled ? "text-text-primary" : "text-text-secondary"
                            )}
                          >
                            {tool.name}
                          </span>
                          <p className="text-xs text-text-muted truncate">
                            {tool.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
