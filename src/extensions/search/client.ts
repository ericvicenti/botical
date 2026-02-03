/**
 * SearXNG Client
 *
 * Client for interacting with the SearXNG metasearch engine.
 * SearXNG provides privacy-respecting web search aggregation.
 */

import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

/**
 * Individual search result from SearXNG
 */
export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string().optional().default(""),
  engine: z.string(),
  parsed_url: z.array(z.string()).optional(),
  category: z.string().optional(),
  score: z.number().optional(),
  thumbnail: z.string().nullable().optional(),
  publishedDate: z.string().nullable().optional(),
});

/**
 * SearXNG search response
 */
export const SearchResponseSchema = z.object({
  query: z.string(),
  number_of_results: z.number().optional(),
  results: z.array(SearchResultSchema),
  suggestions: z.array(z.string()).optional().default([]),
  infoboxes: z.array(z.unknown()).optional().default([]),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/**
 * Search options for SearXNG queries
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Search categories (general, images, videos, news, etc.) */
  categories?: string[];
  /** Specific engines to use */
  engines?: string[];
  /** Language for results */
  language?: string;
  /** Safe search level (0=off, 1=moderate, 2=strict) */
  safesearch?: 0 | 1 | 2;
  /** Time range (day, week, month, year) */
  timeRange?: "day" | "week" | "month" | "year";
}

// ============================================================================
// Client
// ============================================================================

const DEFAULT_SEARXNG_URL = "http://localhost:8888";
const DEFAULT_TIMEOUT = 30000;

/**
 * Make a request to the SearXNG instance
 */
async function searxngRequest<T>(
  path: string,
  options: {
    baseUrl?: string;
    params?: URLSearchParams;
    timeout?: number;
  } = {}
): Promise<T> {
  const baseUrl = options.baseUrl || DEFAULT_SEARXNG_URL;
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  const url = new URL(path, baseUrl);
  if (options.params) {
    url.search = options.params.toString();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SearXNG API error (${response.status}): ${errorText}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("SearXNG request timed out");
    }

    throw error;
  }
}

/**
 * SearXNG client for web searches
 */
export const SearxngClient = {
  /**
   * Check if SearXNG is available
   */
  async isAvailable(baseUrl?: string): Promise<boolean> {
    try {
      const url = baseUrl || DEFAULT_SEARXNG_URL;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${url}/config`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * Perform a web search
   */
  async search(
    query: string,
    options: SearchOptions & { baseUrl?: string } = {}
  ): Promise<SearchResponse> {
    const { baseUrl, limit = 10, categories, engines, language, safesearch, timeRange } = options;

    const params = new URLSearchParams();
    params.set("q", query);
    params.set("format", "json");

    if (categories?.length) {
      params.set("categories", categories.join(","));
    }
    if (engines?.length) {
      params.set("engines", engines.join(","));
    }
    if (language) {
      params.set("language", language);
    }
    if (safesearch !== undefined) {
      params.set("safesearch", String(safesearch));
    }
    if (timeRange) {
      params.set("time_range", timeRange);
    }

    const data = await searxngRequest<unknown>("/search", {
      baseUrl,
      params,
    });

    const parsed = SearchResponseSchema.parse(data);

    // Limit results if requested
    if (limit && parsed.results.length > limit) {
      parsed.results = parsed.results.slice(0, limit);
    }

    return parsed;
  },

  /**
   * Get search suggestions for autocomplete
   */
  async suggest(
    query: string,
    options: { baseUrl?: string } = {}
  ): Promise<string[]> {
    const { baseUrl } = options;

    const params = new URLSearchParams();
    params.set("q", query);

    try {
      const data = await searxngRequest<string[]>("/autocompleter", {
        baseUrl,
        params,
      });
      return Array.isArray(data) ? data : [];
    } catch {
      // Autocomplete is optional, return empty on failure
      return [];
    }
  },
};
