import { commandRegistry } from "../registry";
import { viewCommands } from "./view.commands";
import { tabCommands } from "./tab.commands";
import { fileCommands } from "./file.commands";
import { projectCommands } from "./project.commands";
import { taskCommands } from "./task.commands";
import { scheduleCommands } from "./schedule.commands";
import { getQueryCommands, runCustomQueryCommand } from "./query.commands";

// Ensure primitives are registered before we generate commands from them
import "@/primitives/init";
import { getPrimitiveCommands } from "./primitive.commands";

let registered = false;

export function registerAllCommands() {
  if (registered) return;
  registered = true;

  const allCommands = [
    ...viewCommands,
    ...tabCommands,
    ...fileCommands,
    ...projectCommands,
    ...taskCommands,
    ...scheduleCommands,
    ...getPrimitiveCommands(),
    ...getQueryCommands(),
    runCustomQueryCommand,
  ];

  for (const command of allCommands) {
    commandRegistry.register(command);
  }
}
