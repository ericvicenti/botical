import type { Command, CommandShortcut } from "./types";

class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private shortcutMap: Map<string, Command> = new Map();

  register(command: Command): void {
    this.commands.set(command.id, command);
    if (command.shortcut) {
      const key = this.shortcutToKey(command.shortcut);
      this.shortcutMap.set(key, command);
    }
  }

  unregister(id: string): void {
    const command = this.commands.get(id);
    if (command?.shortcut) {
      const key = this.shortcutToKey(command.shortcut);
      this.shortcutMap.delete(key);
    }
    this.commands.delete(id);
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  getByShortcut(shortcut: CommandShortcut): Command | undefined {
    const key = this.shortcutToKey(shortcut);
    return this.shortcutMap.get(key);
  }

  private shortcutToKey(shortcut: CommandShortcut): string {
    const parts: string[] = [];
    if (shortcut.mod) parts.push("mod");
    if (shortcut.ctrl) parts.push("ctrl");
    if (shortcut.shift) parts.push("shift");
    if (shortcut.alt) parts.push("alt");
    parts.push(shortcut.key.toLowerCase());
    return parts.join("+");
  }

  eventToShortcut(e: KeyboardEvent): CommandShortcut {
    // Use e.code for physical key when modifiers are pressed
    // because modifier+letter can produce special characters on Mac
    let key = e.key.toLowerCase();
    if ((e.altKey || e.ctrlKey) && e.code) {
      // Convert "KeyW" -> "w", "ArrowLeft" -> "arrowleft", etc.
      if (e.code.startsWith("Key")) {
        key = e.code.slice(3).toLowerCase();
      } else if (e.code.startsWith("Digit")) {
        key = e.code.slice(5);
      } else if (e.code === "BracketLeft") {
        key = "[";
      } else if (e.code === "BracketRight") {
        key = "]";
      } else {
        key = e.code.toLowerCase();
      }
    }
    return {
      key,
      mod: e.metaKey,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
    };
  }

  formatShortcut(shortcut: CommandShortcut): string {
    const isMac =
      typeof navigator !== "undefined" &&
      navigator.platform.toLowerCase().includes("mac");
    const parts: string[] = [];

    if (shortcut.mod) parts.push(isMac ? "⌘" : "Ctrl");
    if (shortcut.ctrl) parts.push(isMac ? "⌃" : "Ctrl");
    if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");
    if (shortcut.alt) parts.push(isMac ? "⌥" : "Alt");

    let keyDisplay = shortcut.key.length === 1
      ? shortcut.key.toUpperCase()
      : shortcut.key;

    // Format arrow keys nicely
    if (keyDisplay.toLowerCase() === "arrowleft") keyDisplay = "←";
    else if (keyDisplay.toLowerCase() === "arrowright") keyDisplay = "→";
    else if (keyDisplay.toLowerCase() === "arrowup") keyDisplay = "↑";
    else if (keyDisplay.toLowerCase() === "arrowdown") keyDisplay = "↓";

    parts.push(keyDisplay);

    return parts.join(isMac ? "" : "+");
  }
}

export const commandRegistry = new CommandRegistry();
