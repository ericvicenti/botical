/**
 * ExtensionCard Component
 *
 * Displays a single extension with toggle switch and metadata.
 * Used in the ExtensionsPanel to enable/disable extensions per project.
 * Clicking the card shows extension details.
 */

import { cn } from "@/lib/utils/cn";
import { Box, Container, Server, Database, Cloud, Puzzle, Search, ChevronRight } from "lucide-react";
import type { Extension } from "@/lib/api/types";

interface ExtensionCardProps {
  extension: Extension;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSelect?: () => void;
  isToggling?: boolean;
}

/**
 * Get the Lucide icon component for an extension icon name
 */
function getExtensionIcon(iconName: string) {
  switch (iconName) {
    case "box":
    case "container":
      return Box;
    case "server":
      return Server;
    case "database":
      return Database;
    case "cloud":
      return Cloud;
    case "search":
      return Search;
    default:
      return Puzzle;
  }
}

/**
 * Get status indicator color
 */
function getStatusColor(status: string) {
  switch (status) {
    case "running":
      return "bg-green-500";
    case "starting":
      return "bg-yellow-500 animate-pulse";
    case "error":
      return "bg-red-500";
    default:
      return "bg-zinc-500";
  }
}

export function ExtensionCard({ extension, enabled, onToggle, onSelect, isToggling }: ExtensionCardProps) {
  const Icon = getExtensionIcon(extension.icon);

  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger select if clicking on the toggle
    const target = e.target as HTMLElement;
    if (target.closest('[data-toggle]')) {
      return;
    }
    onSelect?.();
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2",
        "hover:bg-bg-elevated transition-colors rounded cursor-pointer"
      )}
      data-testid={`extension-card-${extension.id}`}
      onClick={handleClick}
    >
      <div
        className={cn(
          "w-8 h-8 flex items-center justify-center rounded relative",
          enabled ? "bg-accent-primary/20 text-accent-primary" : "bg-bg-elevated text-text-secondary"
        )}
      >
        <Icon className="w-4 h-4" />
        {/* Status indicator dot */}
        <div
          className={cn(
            "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-bg-primary",
            getStatusColor(extension.status)
          )}
          title={`Status: ${extension.status}`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {extension.name}
        </div>
        <div className="text-xs text-text-secondary truncate">
          {extension.description}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label
          className="relative inline-flex items-center cursor-pointer"
          data-testid={`extension-toggle-${extension.id}`}
          data-toggle="true"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            disabled={isToggling}
            className="sr-only peer"
          />
          <div
            className={cn(
              "w-9 h-5 rounded-full transition-colors",
              "peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-primary/50",
              enabled ? "bg-accent-primary" : "bg-bg-elevated border border-border",
              isToggling && "opacity-50"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform",
                enabled ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </div>
        </label>
        <ChevronRight className="w-4 h-4 text-text-muted" />
      </div>
    </div>
  );
}
