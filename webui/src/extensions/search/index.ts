/**
 * Search Extension (Frontend)
 *
 * Provides web search UI for Botical using SearXNG.
 */

// Register pages with the primitives system
import "./pages";

// Export components for direct use
export { SearchSidebarPanel } from "./components/SearchSidebarPanel";
export { SearchResultsPage } from "./components/SearchResultsPage";

// Export API hooks
export * from "./api";

// Export page definitions
export { searchSidebarPage, searchResultsPage } from "./pages";
