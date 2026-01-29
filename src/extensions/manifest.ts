/**
 * Extension Manifest Loader
 *
 * Loads and validates extension.json manifests from extension directories.
 */

import { z } from "zod";
import { join, dirname } from "path";

// ============================================================================
// Manifest Schema
// ============================================================================

/**
 * Sidebar configuration in extension.json
 */
export const ManifestSidebarSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
});

export type ManifestSidebar = z.infer<typeof ManifestSidebarSchema>;

/**
 * Frontend configuration in extension.json
 */
export const ManifestFrontendSchema = z.object({
  sidebar: ManifestSidebarSchema.optional(),
  routes: z.array(z.string()).optional(),
});

export type ManifestFrontend = z.infer<typeof ManifestFrontendSchema>;

/**
 * Backend configuration in extension.json
 */
export const ManifestBackendSchema = z.object({
  serverEntry: z.string(),
  defaultPort: z.number().optional(),
});

export type ManifestBackend = z.infer<typeof ManifestBackendSchema>;

/**
 * Setting definition in extension.json
 */
export const ManifestSettingSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  default: z.unknown().optional(),
  description: z.string().optional(),
});

export type ManifestSetting = z.infer<typeof ManifestSettingSchema>;

/**
 * Full extension manifest schema
 */
export const ExtensionManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  icon: z.string(),
  category: z.string().optional(),
  backend: ManifestBackendSchema,
  frontend: ManifestFrontendSchema.optional(),
  settings: z.record(z.string(), ManifestSettingSchema).optional(),
});

export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;

// ============================================================================
// Manifest Loader
// ============================================================================

/**
 * Load an extension manifest from a JSON file
 */
export async function loadManifest(manifestPath: string): Promise<ExtensionManifest> {
  const file = Bun.file(manifestPath);
  const exists = await file.exists();

  if (!exists) {
    throw new Error(`Extension manifest not found: ${manifestPath}`);
  }

  const content = await file.text();
  const json = JSON.parse(content);
  return ExtensionManifestSchema.parse(json);
}

/**
 * Load an extension manifest from an extension directory
 * Looks for extension.json in the directory
 */
export async function loadManifestFromDir(extensionDir: string): Promise<ExtensionManifest> {
  const manifestPath = join(extensionDir, "extension.json");
  return loadManifest(manifestPath);
}

/**
 * Convert a manifest to an ExtensionDefinition for the registry
 */
export function manifestToDefinition(
  manifest: ExtensionManifest,
  extensionDir: string
): import("./types.ts").ExtensionDefinition {
  // Build default settings from manifest settings definitions
  const defaultSettings: Record<string, unknown> = {};
  if (manifest.settings) {
    for (const [key, setting] of Object.entries(manifest.settings)) {
      if (setting.default !== undefined) {
        defaultSettings[key] = setting.default;
      }
    }
  }

  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    icon: manifest.icon,
    defaultPort: manifest.backend.defaultPort,
    serverEntry: manifest.backend.serverEntry,
    defaultSettings: Object.keys(defaultSettings).length > 0 ? defaultSettings : undefined,
    // Store frontend config for UI consumption
    frontend: manifest.frontend,
    category: manifest.category,
    extensionDir,
  };
}

/**
 * Load an extension from its directory, returning a definition for the registry
 */
export async function loadExtension(extensionDir: string): Promise<import("./types.ts").ExtensionDefinition> {
  const manifest = await loadManifestFromDir(extensionDir);
  return manifestToDefinition(manifest, extensionDir);
}
