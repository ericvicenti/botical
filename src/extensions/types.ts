/**
 * Extension System Types
 *
 * Defines the structure for Iris extensions - self-contained modules
 * that provide additional functionality via their own backend servers.
 */

import { z } from "zod";
import type { Hono } from "hono";

// ============================================================================
// Extension Definition
// ============================================================================

/**
 * Extension definition - the manifest for an extension
 */
export interface ExtensionDefinition {
  /** Unique identifier (e.g., "docker", "kubernetes") */
  id: string;

  /** Display name */
  name: string;

  /** Description for extension browser */
  description: string;

  /** Version following semver */
  version: string;

  /** Icon name (lucide icon) */
  icon: string;

  /** Default port for the extension server (0 = auto-assign) */
  defaultPort?: number;

  /** Server entry point (relative to extension directory) */
  serverEntry: string;

  /** Zod schema for extension settings */
  settingsSchema?: z.ZodType;

  /** Default settings values */
  defaultSettings?: Record<string, unknown>;
}

/**
 * Runtime state of an extension server
 */
export interface ExtensionServerState {
  /** Extension ID */
  extensionId: string;

  /** Process ID of the server */
  pid: number | null;

  /** Port the server is running on */
  port: number;

  /** Server status */
  status: "starting" | "running" | "stopped" | "error";

  /** Error message if status is "error" */
  error?: string;

  /** When the server was started */
  startedAt?: number;
}

// ============================================================================
// Extension Configuration (Project-Level)
// ============================================================================

/**
 * Extension settings in project config
 */
export const ExtensionSettingsSchema = z.record(z.string(), z.record(z.unknown()));

/**
 * Extensions configuration in project YAML
 */
export const ExtensionsConfigSchema = z.object({
  /** Enabled extension IDs */
  enabled: z.array(z.string()).default([]),

  /** Per-extension settings overrides */
  settings: ExtensionSettingsSchema.optional(),
});

export type ExtensionsConfig = z.infer<typeof ExtensionsConfigSchema>;

/**
 * Sidebar configuration in project YAML
 */
export const SidebarConfigSchema = z.object({
  /** Ordered list of page IDs to show in sidebar */
  panels: z.array(z.string()).default([
    "files",
    "tasks",
    "git",
    "run",
  ]),
});

export type SidebarConfig = z.infer<typeof SidebarConfigSchema>;

// ============================================================================
// Extension Server Interface
// ============================================================================

/**
 * Interface that extension servers must implement
 */
export interface ExtensionServer {
  /** Create the Hono app for this extension */
  createApp(): Hono;

  /** Called when the server starts */
  onStart?(): Promise<void>;

  /** Called when the server stops */
  onStop?(): Promise<void>;
}

// ============================================================================
// Helper function for defining extensions
// ============================================================================

/**
 * Define an extension with type checking
 */
export function defineExtension(definition: ExtensionDefinition): ExtensionDefinition {
  return definition;
}
