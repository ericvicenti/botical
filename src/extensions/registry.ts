/**
 * Extension Registry
 *
 * Manages the registration and discovery of extensions.
 * Extensions are registered at startup and their metadata is available
 * for the UI to display and for the server manager to launch.
 */

import type { ExtensionDefinition, ExtensionServerState } from "./types.ts";

// ============================================================================
// Extension Registry
// ============================================================================

class ExtensionRegistryImpl {
  private extensions = new Map<string, ExtensionDefinition>();
  private serverStates = new Map<string, ExtensionServerState>();

  /**
   * Register an extension
   */
  register(extension: ExtensionDefinition): void {
    if (this.extensions.has(extension.id)) {
      console.warn(`Extension "${extension.id}" is already registered, skipping`);
      return;
    }
    this.extensions.set(extension.id, extension);
    console.log(`[ExtensionRegistry] Registered extension: ${extension.id}`);
  }

  /**
   * Get an extension by ID
   */
  get(id: string): ExtensionDefinition | undefined {
    return this.extensions.get(id);
  }

  /**
   * Get all registered extensions
   */
  getAll(): ExtensionDefinition[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Check if an extension is registered
   */
  has(id: string): boolean {
    return this.extensions.has(id);
  }

  /**
   * Get extension IDs
   */
  getIds(): string[] {
    return Array.from(this.extensions.keys());
  }

  // ============================================================================
  // Server State Management
  // ============================================================================

  /**
   * Update the server state for an extension
   */
  setServerState(extensionId: string, state: ExtensionServerState): void {
    this.serverStates.set(extensionId, state);
  }

  /**
   * Get the server state for an extension
   */
  getServerState(extensionId: string): ExtensionServerState | undefined {
    return this.serverStates.get(extensionId);
  }

  /**
   * Get all server states
   */
  getAllServerStates(): ExtensionServerState[] {
    return Array.from(this.serverStates.values());
  }

  /**
   * Check if an extension server is running
   */
  isServerRunning(extensionId: string): boolean {
    const state = this.serverStates.get(extensionId);
    return state?.status === "running";
  }

  /**
   * Get the port for a running extension server
   */
  getServerPort(extensionId: string): number | undefined {
    const state = this.serverStates.get(extensionId);
    if (state?.status === "running") {
      return state.port;
    }
    return undefined;
  }

  /**
   * Clear server state (used when server stops)
   */
  clearServerState(extensionId: string): void {
    this.serverStates.delete(extensionId);
  }
}

// Singleton instance
export const ExtensionRegistry = new ExtensionRegistryImpl();
