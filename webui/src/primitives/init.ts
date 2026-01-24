/**
 * Initialize all Iris Primitives
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

console.log("[Iris Primitives] Initialized");
