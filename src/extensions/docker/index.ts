/**
 * Docker Extension
 *
 * Provides Docker container management functionality for Botical.
 * This extension runs its own HTTP server and provides:
 * - Container listing, starting, stopping
 * - Image management
 * - Log viewing
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { loadExtension } from "../manifest.ts";
import { ExtensionRegistry } from "../registry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the extension from extension.json
const dockerExtension = await loadExtension(__dirname);

// Register the extension
ExtensionRegistry.register(dockerExtension);

export default dockerExtension;
