import { commandRegistry } from "@/commands/registry";
import { cn } from "@/lib/utils/cn";
import { useMemo } from "react";

interface ShortcutsPageProps {
  params: Record<string, never>;
  search?: unknown;
}

export default function ShortcutsPage(_props: ShortcutsPageProps) {
  const commands = useMemo(() => {
    return commandRegistry.getAll().filter(cmd => cmd.shortcut);
  }, []);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, typeof commands> = {};
    for (const cmd of commands) {
      const category = cmd.category || "other";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(cmd);
    }
    return groups;
  }, [commands]);

  const categoryLabels: Record<string, string> = {
    view: "View",
    tab: "Tabs",
    file: "Files",
    project: "Projects",
    mission: "Missions",
    process: "Processes",
    other: "Other",
  };

  const categoryOrder = ["view", "tab", "file", "project", "mission", "process", "other"];

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-text-primary mb-2">Keyboard Shortcuts</h1>
      <p className="text-text-muted mb-8">
        Quick reference for all available keyboard shortcuts.
      </p>

      <div className="space-y-8">
        {categoryOrder.map((category) => {
          const cmds = groupedCommands[category];
          if (!cmds || cmds.length === 0) return null;

          return (
            <div key={category}>
              <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-3">
                {categoryLabels[category] || category}
              </h2>
              <div className="space-y-1">
                {cmds.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="flex items-center justify-between py-2 px-3 rounded hover:bg-bg-elevated"
                  >
                    <div>
                      <div className="text-text-primary">{cmd.label}</div>
                      {cmd.description && (
                        <div className="text-xs text-text-muted">{cmd.description}</div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd className={cn(
                        "px-2 py-1 rounded text-xs font-mono",
                        "bg-bg-secondary border border-border text-text-secondary"
                      )}>
                        {commandRegistry.formatShortcut(cmd.shortcut)}
                      </kbd>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-4 bg-bg-secondary rounded-lg border border-border">
        <p className="text-sm text-text-muted">
          Press <kbd className="px-1.5 py-0.5 rounded bg-bg-primary border border-border text-xs font-mono">⌘K</kbd> to open the command palette and search for any command.
        </p>
      </div>
    </div>
  );
}
