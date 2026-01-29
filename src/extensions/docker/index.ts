/**
 * Docker Extension
 *
 * Provides Docker container management functionality for Iris.
 * This extension runs its own HTTP server and provides:
 * - Container listing, starting, stopping
 * - Image management
 * - Log viewing
 */

import { defineExtension } from "../types.ts";
import { ExtensionRegistry } from "../registry.ts";

const dockerExtension = defineExtension({
  id: "docker",
  name: "Docker",
  description: "Manage Docker containers, images, and networks",
  version: "1.0.0",
  icon: "container",

  // Server configuration
  defaultPort: 4101,
  serverEntry: "server.ts",

  // Default settings
  defaultSettings: {
    socketPath: "/var/run/docker.sock",
  },
});

// Register the extension
ExtensionRegistry.register(dockerExtension);

export default dockerExtension;
