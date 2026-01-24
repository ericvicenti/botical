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

// Git primitives
import "./git/actions";
import "./git/pages";

// Future primitives will be imported here:
// import "./file/pages";
// import "./task/pages";
// import "./process/pages";
// etc.

console.log("[Iris Primitives] Initialized");
