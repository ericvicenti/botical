/**
 * Initialize all Botical Primitives
 *
 * This file imports and registers all primitives (actions and pages).
 * Import this file once at app startup.
 */

// Home primitives
import "./home/pages";

// Project primitives
import "./project/pages";

// Task primitives
import "./task/pages";

// Process primitives
import "./process/pages";

// File primitives
import "./file/pages";

// Git primitives
import "./git/actions";
import "./git/pages";

// Workflow primitives
import "./workflow/pages";

// Settings primitives
import "./settings/pages";

// Overview primitives
import "./overview/pages";

// Extensions (load all frontend extensions)
import "../extensions";

console.log("[Botical Primitives] Initialized");
