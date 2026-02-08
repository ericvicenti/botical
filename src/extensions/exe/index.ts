/**
 * Exe.dev Extension
 *
 * Provides exe.dev VM management for Botical.
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { loadExtension } from "../manifest.ts";
import { ExtensionRegistry } from "../registry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const exeExtension = await loadExtension(__dirname);

ExtensionRegistry.register(exeExtension);

export default exeExtension;
