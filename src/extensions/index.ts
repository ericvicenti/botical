/**
 * Extensions Module
 *
 * Provides the extension system for Botical - a way to add modular features
 * that run as separate server processes.
 */

export { ExtensionRegistry } from "./registry.ts";
export {
  startExtensionServer,
  stopExtensionServer,
  stopAllExtensionServers,
  restartExtensionServer,
  startEnabledExtensions,
  getExtensionServerUrl,
} from "./server-manager.ts";
export {
  defineExtension,
  ExtensionsConfigSchema,
  SidebarConfigSchema,
  type ExtensionDefinition,
  type ExtensionServerState,
  type ExtensionsConfig,
  type SidebarConfig,
  type ExtensionServer,
  type ExtensionFrontendConfig,
  type ExtensionSidebarConfig,
} from "./types.ts";
export {
  loadManifest,
  loadManifestFromDir,
  loadExtension,
  manifestToDefinition,
  ExtensionManifestSchema,
  type ExtensionManifest,
} from "./manifest.ts";

// Register built-in extensions
import "./docker/index.ts";
import "./exe/index.ts";
import "./search/index.ts";
