/**
 * Search Extension Pages
 *
 * Registers all Search extension pages with the primitives system.
 */

import { z } from "zod";
import { definePage } from "@/primitives/registry";
import { SearchSidebarPanel } from "./components/SearchSidebarPanel";
import { SearchResultsPage } from "./components/SearchResultsPage";

/**
 * Search sidebar panel - shows search input and quick results
 */
export const searchSidebarPage = definePage({
  id: "search.sidebar",
  icon: "search",
  size: "sidebar",
  category: "search",
  description: "Web search panel",

  getLabel: () => "Search",

  params: z.object({}),
  route: "",
  parseParams: () => ({}),
  getRouteParams: () => ({}),

  component: SearchSidebarPanel,
});

/**
 * Search results page - full results view
 */
export const searchResultsPage = definePage({
  id: "search.results",
  icon: "search",
  size: "full",
  category: "search",
  description: "Web search results",

  getLabel: (params) => `Search: ${params.query || "Results"}`,
  getTitle: (params) => `${params.query || "Search"} - Web Search`,

  params: z.object({
    query: z.string(),
  }),

  route: "/search/results/$query",
  parseParams: (routeParams) => ({
    query: decodeURIComponent(routeParams.query || ""),
  }),
  getRouteParams: (params) => ({
    query: encodeURIComponent(params.query),
  }),

  component: SearchResultsPage,
});
