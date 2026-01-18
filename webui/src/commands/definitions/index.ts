import { commandRegistry } from "../registry";
import { viewCommands } from "./view.commands";
import { tabCommands } from "./tab.commands";
import { fileCommands } from "./file.commands";
import { projectCommands } from "./project.commands";

let registered = false;

export function registerAllCommands() {
  if (registered) return;
  registered = true;

  const allCommands = [
    ...viewCommands,
    ...tabCommands,
    ...fileCommands,
    ...projectCommands,
  ];

  for (const command of allCommands) {
    commandRegistry.register(command);
  }
}
