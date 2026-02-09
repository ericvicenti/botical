import { useState, useMemo } from "react";
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
  Clock,
  Settings,
  Check,
} from "lucide-react";

interface ToolsPanelProps {
  enabledTools: Set<string>;
  onToggleTool: (toolName: string) => void;
}

type DisplayCategory = "filesystem" | "search" | "execution" | "agent" | "action" | "scheduling" | "settings" | "other";

const CATEGORY_INFO: Record<DisplayCategory, { label: string; icon: typeof Wrench; description: string }> = {
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
  scheduling: {
    label: "Scheduling",
    icon: Clock,
    description: "Schedules and automation",
  },
  settings: {
    label: "Settings",
    icon: Settings,
    description: "Project and user settings",
  },
  other: {
    label: "Other",
    icon: Wrench,
    description: "Miscellaneous tools",
  },
};

// Remap backend "other" category tools to more specific display categories
const TOOL_CATEGORY_OVERRIDES: Record<string, DisplayCategory> = {
  schedule: "scheduling",
  create_schedule: "scheduling",
  list_schedules: "scheduling",
  delete_schedule: "scheduling",
  set_theme: "settings",
  toggle_sidebar: "settings",
  set_sidebar_panel: "settings",
  update_settings: "settings",
  get_settings: "settings",
};

const CATEGORY_ORDER: DisplayCategory[] = [
  "filesystem", "search", "execution", "agent", "action", "scheduling", "settings", "other",
];

export function ToolsPanel({
  enabledTools,
  onToggleTool,
}: ToolsPanelProps) {
  const { data: coreTools, isLoading } = useCoreTools();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORY_ORDER)
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

  // Group tools by display category
  const toolsByCategory = useMemo(() => {
    const map = new Map<DisplayCategory, typeof coreTools>();
    for (const tool of coreTools || []) {
      const displayCat = TOOL_CATEGORY_OVERRIDES[tool.name] || (tool.category as DisplayCategory);
      if (!map.has(displayCat)) {
        map.set(displayCat, []);
      }
      map.get(displayCat)!.push(tool);
    }
    return map;
  }, [coreTools]);

  const sortedCategories = CATEGORY_ORDER.filter((c) => toolsByCategory.has(c));

  const handleToggleAll = (category: DisplayCategory) => {
    const tools = toolsByCategory.get(category) || [];
    const allEnabled = tools.every((t) => enabledTools.has(t.name));
    for (const tool of tools) {
      if (allEnabled) {
        // Disable all in category
        if (enabledTools.has(tool.name)) {
          onToggleTool(tool.name);
        }
      } else {
        // Enable all in category
        if (!enabledTools.has(tool.name)) {
          onToggleTool(tool.name);
        }
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-text-muted">
        Loading tools...
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-bg-tertiary flex items-center gap-2 shrink-0">
        <Wrench className="w-4 h-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">Agent Tools</span>
        <span className="text-xs text-text-muted ml-auto">
          {enabledTools.size} enabled
        </span>
      </div>

      {/* Tool categories */}
      <div className="divide-y divide-border overflow-y-auto flex-1">
        {sortedCategories.map((category) => {
          const info = CATEGORY_INFO[category];
          const tools = toolsByCategory.get(category) || [];
          const isExpanded = expandedCategories.has(category);
          const enabledCount = tools.filter((t) => enabledTools.has(t.name)).length;
          const allEnabled = enabledCount === tools.length && tools.length > 0;
          const someEnabled = enabledCount > 0 && !allEnabled;
          const Icon = info.icon;

          return (
            <div key={category}>
              {/* Category header */}
              <div className="flex items-center">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex-1 px-3 py-2 flex items-center gap-2 hover:bg-bg-tertiary/50 transition-colors"
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
                {/* Select all checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleAll(category); }}
                  className="px-3 py-2 hover:bg-bg-tertiary/50 transition-colors"
                  title={allEnabled ? "Deselect all" : "Select all"}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center",
                      allEnabled
                        ? "border-accent-primary bg-accent-primary"
                        : someEnabled
                          ? "border-accent-primary bg-accent-primary/30"
                          : "border-border"
                    )}
                  >
                    {(allEnabled || someEnabled) && (
                      <Check className="w-2.5 h-2.5 text-white" />
                    )}
                  </div>
                </button>
              </div>

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
