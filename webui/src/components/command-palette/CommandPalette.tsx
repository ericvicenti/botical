import { useState, useEffect, useCallback, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCommands } from "@/commands/context";
import { commandRegistry } from "@/commands/registry";
import { cn } from "@/lib/utils/cn";
import type { Command, CommandArg } from "@/commands/types";

export function CommandPalette() {
  const { isPaletteOpen, closePalette, searchCommands, execute } = useCommands();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [currentArgIndex, setCurrentArgIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCommands = searchCommands(query);

  // Reset state when palette opens/closes
  useEffect(() => {
    if (isPaletteOpen) {
      setQuery("");
      setSelectedIndex(0);
      setSelectedCommand(null);
      setArgValues({});
      setCurrentArgIndex(0);
    }
  }, [isPaletteOpen]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const selectedItem = list.children[selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const executeCommand = useCallback(
    async (command: Command, args: Record<string, unknown> = {}) => {
      closePalette();
      await execute(command.id, args);
    },
    [closePalette, execute]
  );

  const handleSelectCommand = useCallback(
    (command: Command) => {
      if (command.args && command.args.length > 0) {
        setSelectedCommand(command);
        setArgValues({});
        setCurrentArgIndex(0);
      } else {
        executeCommand(command);
      }
    },
    [executeCommand]
  );

  const handleArgSubmit = useCallback(() => {
    if (!selectedCommand?.args) return;

    const currentArg = selectedCommand.args[currentArgIndex];
    if (currentArg.required && !argValues[currentArg.name]) {
      return;
    }

    if (currentArgIndex < selectedCommand.args.length - 1) {
      setCurrentArgIndex(currentArgIndex + 1);
    } else {
      executeCommand(selectedCommand, argValues);
    }
  }, [selectedCommand, currentArgIndex, argValues, executeCommand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (selectedCommand) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleArgSubmit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setSelectedCommand(null);
          setArgValues({});
          setCurrentArgIndex(0);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) =>
            i < filteredCommands.length - 1 ? i + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) =>
            i > 0 ? i - 1 : filteredCommands.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            handleSelectCommand(filteredCommands[selectedIndex]);
          }
          break;
      }
    },
    [filteredCommands, selectedIndex, selectedCommand, handleSelectCommand, handleArgSubmit]
  );

  const renderArgInput = (arg: CommandArg) => {
    const inputClasses = "w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary";

    return (
      <div className="p-2 border-t border-border">
        <label className="block text-xs text-text-secondary mb-1">
          {arg.label}
          {arg.required && <span className="text-accent-error ml-1">*</span>}
        </label>
        {arg.type === "textarea" ? (
          <textarea
            value={argValues[arg.name] || ""}
            onChange={(e) =>
              setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
            }
            placeholder={arg.placeholder}
            className={cn(inputClasses, "resize-none")}
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              // Allow Cmd+Enter to submit
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleArgSubmit();
              }
            }}
          />
        ) : arg.type === "select" && arg.options ? (
          <select
            value={argValues[arg.name] || ""}
            onChange={(e) =>
              setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
            }
            className={inputClasses}
            autoFocus
          >
            <option value="">Select...</option>
            {arg.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={arg.type === "number" ? "number" : "text"}
            value={argValues[arg.name] || ""}
            onChange={(e) =>
              setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
            }
            placeholder={arg.placeholder}
            className={inputClasses}
            autoFocus
          />
        )}
        {arg.type === "textarea" && (
          <div className="text-xs text-text-muted mt-1">
            Press ⌘+Enter to submit
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isPaletteOpen}
      onClose={closePalette}
      position="top"
      className="w-[500px] max-h-[400px] overflow-hidden"
    >
      <div onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="p-2 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={selectedCommand ? selectedCommand.label : query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            disabled={!!selectedCommand}
            className={cn(
              "w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary",
              selectedCommand && "opacity-50"
            )}
            autoFocus
          />
        </div>

        {/* Arg input */}
        {selectedCommand?.args && selectedCommand.args[currentArgIndex] && (
          renderArgInput(selectedCommand.args[currentArgIndex])
        )}

        {/* Command list */}
        {!selectedCommand && (
          <div
            ref={listRef}
            className="max-h-[320px] overflow-y-auto scrollbar-thin"
          >
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-text-secondary">
                No commands found
              </div>
            ) : (
              filteredCommands.map((command, index) => (
                <button
                  key={command.id}
                  onClick={() => handleSelectCommand(command)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full px-4 py-2 flex items-center justify-between text-left transition-colors border-l-2",
                    index === selectedIndex
                      ? "bg-accent-primary/10 border-l-accent-primary"
                      : "border-l-transparent hover:bg-bg-tertiary/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary truncate">
                      {command.label}
                    </div>
                    {command.description && (
                      <div className="text-xs text-text-secondary truncate">
                        {command.description}
                      </div>
                    )}
                  </div>
                  {command.shortcut && (
                    <kbd className="ml-2 px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-secondary shrink-0">
                      {commandRegistry.formatShortcut(command.shortcut)}
                    </kbd>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
