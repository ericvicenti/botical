/**
 * Backend Actions Loader
 *
 * Fetches backend actions from the API and registers them as commands.
 * This component should be rendered once at the app root level.
 */

import { useEffect, useRef } from "react";
import { useBackendActions } from "@/lib/api/queries";
import { commandRegistry } from "./registry";
import { convertBackendActions } from "./definitions/backend-actions.commands";

export function BackendActionsLoader() {
  const { data: actions } = useBackendActions();
  const registeredIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!actions || actions.length === 0) return;

    // Convert and register backend actions
    const commands = convertBackendActions(actions);

    for (const command of commands) {
      // Only register if not already registered
      if (!registeredIdsRef.current.has(command.id)) {
        commandRegistry.register(command);
        registeredIdsRef.current.add(command.id);
      }
    }

    // Cleanup function to unregister on unmount
    return () => {
      for (const id of registeredIdsRef.current) {
        commandRegistry.unregister(id);
      }
      registeredIdsRef.current.clear();
    };
  }, [actions]);

  // This component doesn't render anything
  return null;
}
