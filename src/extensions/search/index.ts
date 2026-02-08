/**
 * Search Extension
 *
 * Provides web search functionality for Botical using SearXNG.
 * This extension runs its own HTTP server and provides:
 * - Web search queries via SearXNG metasearch engine
 * - Auto-provisioning of SearXNG Docker container
 * - Search suggestions/autocomplete
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { loadExtension } from "../manifest.ts";
import { ExtensionRegistry } from "../registry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the extension from extension.json
const searchExtension = await loadExtension(__dirname);

// Register the extension
ExtensionRegistry.register(searchExtension);

export default searchExtension;
