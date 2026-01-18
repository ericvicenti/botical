import { useEffect } from "react";
import { useCommands } from "@/commands/context";
import { commandRegistry } from "@/commands/registry";

export function useKeyboardShortcuts() {
  const { execute, openPalette, getExecutionContext } = useCommands();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs (unless it's Escape)
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd+K opens command palette (works even in inputs)
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "k") {
        e.preventDefault();
        openPalette();
        return;
      }

      // Don't process other shortcuts when in inputs
      if (isInput) return;

      const shortcut = commandRegistry.eventToShortcut(e);
      const command = commandRegistry.getByShortcut(shortcut);

      if (command) {
        const ctx = getExecutionContext();
        // Check if command is available in current context
        if (!command.when || command.when(ctx)) {
          e.preventDefault();
          execute(command.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [execute, openPalette, getExecutionContext]);
}
