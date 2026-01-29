/**
 * ExtensionCard Component
 *
 * Displays a single extension with toggle switch and metadata.
 * Used in the ExtensionsPanel to enable/disable extensions per project.
 */

import { cn } from "@/lib/utils/cn";
import { Box, Container, Server, Database, Cloud, Puzzle } from "lucide-react";
import type { Extension } from "@/lib/api/types";

interface ExtensionCardProps {
  extension: Extension;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
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
    default:
      return Puzzle;
  }
}

export function ExtensionCard({ extension, enabled, onToggle, isToggling }: ExtensionCardProps) {
  const Icon = getExtensionIcon(extension.icon);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2",
        "hover:bg-bg-elevated transition-colors rounded"
      )}
      data-testid={`extension-card-${extension.id}`}
    >
      <div
        className={cn(
          "w-8 h-8 flex items-center justify-center rounded",
          enabled ? "bg-accent-primary/20 text-accent-primary" : "bg-bg-elevated text-text-secondary"
        )}
      >
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {extension.name}
        </div>
        <div className="text-xs text-text-secondary truncate">
          {extension.description}
        </div>
      </div>

      <label
        className="relative inline-flex items-center cursor-pointer"
        data-testid={`extension-toggle-${extension.id}`}
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
    </div>
  );
}
