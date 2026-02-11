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
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCommands = searchCommands(query);

  // Reset state when palette opens/closes
  useEffect(() => {
    if (isPaletteOpen) {
      setQuery("");
      setSelectedIndex(0);
      setSelectedCommand(null);
      setArgValues({});
    }
  }, [isPaletteOpen]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus first input when command is selected
  useEffect(() => {
    if (selectedCommand?.args && selectedCommand.args.length > 0) {
      // Small delay to let the DOM update
      setTimeout(() => {
        const firstInput = formRef.current?.querySelector('input, textarea, select') as HTMLElement;
        firstInput?.focus();
      }, 50);
    }
  }, [selectedCommand]);

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
        // Check if all args are optional - if so, can execute immediately
        const hasRequiredArgs = command.args.some(arg => arg.required);
        if (!hasRequiredArgs) {
          // All args optional - show form but allow immediate execution
          setSelectedCommand(command);
          setArgValues({});
        } else {
          setSelectedCommand(command);
          setArgValues({});
        }
      } else {
        executeCommand(command);
      }
    },
    [executeCommand]
  );

  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommand) return;

    // Check required fields
    const missingRequired = selectedCommand.args?.filter(
      arg => arg.required && !argValues[arg.name]?.trim()
    );

    if (missingRequired && missingRequired.length > 0) {
      // Focus the first missing required field
      const firstMissing = missingRequired[0];
      const input = formRef.current?.querySelector(`[name="${firstMissing.name}"]`) as HTMLElement;
      input?.focus();
      return;
    }

    executeCommand(selectedCommand, argValues);
  }, [selectedCommand, argValues, executeCommand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (selectedCommand) {
        if (e.key === "Escape") {
          e.preventDefault();
          setSelectedCommand(null);
          setArgValues({});
        }
        // Enter is handled by form submit
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
    [filteredCommands, selectedIndex, selectedCommand, handleSelectCommand]
  );

  const renderArgInput = (arg: CommandArg, autoFocus: boolean) => {
    const inputClasses = "w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary";

    if (arg.type === "textarea") {
      return (
        <textarea
          name={arg.name}
          value={argValues[arg.name] || ""}
          onChange={(e) =>
            setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
          }
          placeholder={arg.placeholder}
          className={cn(inputClasses, "resize-none")}
          rows={3}
          autoFocus={autoFocus}
        />
      );
    }

    if (arg.type === "select" && arg.options) {
      return (
        <select
          name={arg.name}
          value={argValues[arg.name] || ""}
          onChange={(e) =>
            setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
          }
          className={inputClasses}
          autoFocus={autoFocus}
        >
          <option value="">Select...</option>
          {arg.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        name={arg.name}
        type={arg.type === "number" ? "number" : "text"}
        value={argValues[arg.name] || ""}
        onChange={(e) =>
          setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
        }
        placeholder={arg.placeholder}
        className={inputClasses}
        autoFocus={autoFocus}
      />
    );
  };

  const renderArgsForm = () => {
    if (!selectedCommand?.args) return null;

    const requiredArgs = selectedCommand.args.filter(arg => arg.required);
    const optionalArgs = selectedCommand.args.filter(arg => !arg.required);

    return (
      <form ref={formRef} onSubmit={handleFormSubmit} className="border-t border-border">
        <div className="p-3 space-y-3">
          {/* Required args first */}
          {requiredArgs.map((arg, index) => (
            <div key={arg.name}>
              <label className="block text-xs text-text-secondary mb-1">
                {arg.label}
                <span className="text-accent-error ml-1">*</span>
              </label>
              {renderArgInput(arg, index === 0)}
            </div>
          ))}

          {/* Optional args */}
          {optionalArgs.length > 0 && (
            <>
              {requiredArgs.length > 0 && optionalArgs.length > 0 && (
                <div className="text-xs text-text-muted pt-1">Optional</div>
              )}
              {optionalArgs.map((arg, index) => (
                <div key={arg.name}>
                  <label className="block text-xs text-text-secondary mb-1">
                    {arg.label}
                  </label>
                  {renderArgInput(arg, requiredArgs.length === 0 && index === 0)}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Submit button */}
        <div className="px-3 pb-3 flex justify-between items-center">
          <span className="text-xs text-text-muted">
            Press Enter to run
          </span>
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors"
          >
            Run
          </button>
        </div>
      </form>
    );
  };

  return (
    <Modal
      isOpen={isPaletteOpen}
      onClose={closePalette}
      position="top"
      className="w-full sm:w-[500px] max-h-[95vh] sm:max-h-[500px] overflow-hidden"
    >
      <div onKeyDown={handleKeyDown}>
        {/* Search input / Command header */}
        <div className="p-2 border-b border-border">
          {selectedCommand ? (
            <div className="flex items-center gap-2 px-1">
              <button
                onClick={() => {
                  setSelectedCommand(null);
                  setArgValues({});
                }}
                className="p-1 hover:bg-bg-tertiary rounded text-text-secondary"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="text-text-primary font-medium">{selectedCommand.label}</div>
                {selectedCommand.description && (
                  <div className="text-xs text-text-secondary">{selectedCommand.description}</div>
                )}
              </div>
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command..."
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary"
              autoFocus
            />
          )}
        </div>

        {/* Args form */}
        {selectedCommand && renderArgsForm()}

        {/* Command list */}
        {!selectedCommand && (
          <div
            ref={listRef}
            className="max-h-[400px] overflow-y-auto scrollbar-thin"
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
