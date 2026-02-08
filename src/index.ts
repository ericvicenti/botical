/**
 * Botical - AI Agent Workspace Backend
 *
 * Main entry point for the server.
 */

import { createServer } from "./server/index.ts";

// Start the server
createServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
