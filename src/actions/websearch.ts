/**
 * Web Search Action
 *
 * Provides web search capabilities for AI agents using the SearXNG extension.
 */

import { z } from "zod";
import { defineAction, success, error } from "./types.ts";
import { getExtensionServerUrl } from "../extensions/server-manager.ts";

const MAX_RESULTS = 10;
const DEFAULT_RESULTS = 5;

/**
 * search.web - Search the web
 */
export const webSearch = defineAction({
  id: "search.web",
  label: "Web Search",
  description: `Search the web using SearXNG privacy-respecting metasearch engine. Returns titles, URLs, and snippets from search results.`,
  category: "search",
  icon: "globe",

  params: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().int().min(1).max(MAX_RESULTS).optional()
      .describe("Maximum number of results to return (default: 5, max: 10)"),
    categories: z.array(z.string()).optional()
      .describe("Search categories: general, images, videos, news, science, files, social_media"),
    timeRange: z.enum(["day", "week", "month", "year"]).optional()
      .describe("Filter results by time range"),
  }),

  execute: async ({ query, limit = DEFAULT_RESULTS, categories, timeRange }, context) => {
    // Get the search extension server URL
    const extensionUrl = getExtensionServerUrl("search");

    if (!extensionUrl) {
      return error(
        "Web search extension is not running. Enable the 'search' extension in project settings.",
        "EXTENSION_NOT_RUNNING"
      );
    }

    // Build the search URL
    const searchUrl = new URL(`${extensionUrl}/search/`);
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("limit", String(Math.min(limit, MAX_RESULTS)));

    if (categories?.length) {
      searchUrl.searchParams.set("categories", categories.join(","));
    }

    if (timeRange) {
      searchUrl.searchParams.set("time_range", timeRange);
    }

    try {
      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        const errorText = await response.text();
        return error(`Search failed: ${errorText}`, "SEARCH_FAILED");
      }

      const json = await response.json() as {
        data?: {
          query: string;
          results: Array<{
            title: string;
            url: string;
            content?: string;
            engine: string;
          }>;
          suggestions?: string[];
        };
        error?: string;
      };

      if (json.error) {
        return error(`Search failed: ${json.error}`, "SEARCH_FAILED");
      }

      const data = json.data;
      if (!data || !data.results) {
        return error("Invalid response from search extension", "INVALID_RESPONSE");
      }

      // Format results for display
      const results = data.results.slice(0, limit);

      if (results.length === 0) {
        return success(
          "No results found",
          `No search results found for "${query}"`,
          { query, resultCount: 0 }
        );
      }

      // Format output for AI agent consumption
      const formattedResults = results.map((r, i) => {
        const snippet = r.content ? `\n   ${r.content}` : "";
        return `${i + 1}. ${r.title}\n   ${r.url}${snippet}`;
      }).join("\n\n");

      const output = `Search results for "${query}":\n\n${formattedResults}`;

      // Add suggestions if available
      let suggestionsText = "";
      if (data.suggestions && data.suggestions.length > 0) {
        suggestionsText = `\n\nRelated searches: ${data.suggestions.slice(0, 5).join(", ")}`;
      }

      return success(
        `Found ${results.length} result${results.length !== 1 ? "s" : ""}`,
        output + suggestionsText,
        {
          query,
          resultCount: results.length,
          results: results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
            engine: r.engine,
          })),
          suggestions: data.suggestions,
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search request failed";
      return error(message, "REQUEST_FAILED");
    }
  },
});

/**
 * All web search actions
 */
export const webSearchActions = [webSearch];
