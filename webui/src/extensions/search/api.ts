/**
 * Search Extension API Hooks
 *
 * React Query hooks for interacting with the Search extension API.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

// ============================================================================
// Types
// ============================================================================

export interface SearchResult {
  title: string;
  url: string;
  content?: string;
  engine: string;
  category?: string;
  publishedDate?: string;
  thumbnail?: string;
}

export interface SearchResponse {
  query: string;
  number_of_results?: number;
  results: SearchResult[];
  suggestions: string[];
}

export interface SearchStatus {
  available: boolean;
  containerExists: boolean;
  containerRunning: boolean;
  containerId?: string;
  error?: string;
}

export interface SearchOptions {
  limit?: number;
  categories?: string[];
  engines?: string[];
  language?: string;
  safesearch?: 0 | 1 | 2;
  timeRange?: "day" | "week" | "month" | "year";
}

// ============================================================================
// Query Keys
// ============================================================================

export const searchKeys = {
  all: ["search"] as const,
  status: () => [...searchKeys.all, "status"] as const,
  available: () => [...searchKeys.all, "available"] as const,
  results: (query: string, options?: SearchOptions) =>
    [...searchKeys.all, "results", query, options] as const,
  suggestions: (query: string) => [...searchKeys.all, "suggestions", query] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Check if SearXNG is available
 */
export function useSearchAvailable() {
  return useQuery({
    queryKey: searchKeys.available(),
    queryFn: async () => {
      const response = await apiClient<{ available: boolean }>(
        "/api/extensions/search/search/available"
      );
      return response.available;
    },
    staleTime: 30000,
  });
}

/**
 * Get SearXNG status including container info
 */
export function useSearchStatus() {
  return useQuery({
    queryKey: searchKeys.status(),
    queryFn: async () => {
      return apiClient<SearchStatus>("/api/extensions/search/search/status");
    },
    staleTime: 10000,
  });
}

/**
 * Execute a search query
 */
export function useSearch(query: string, options: SearchOptions = {}) {
  return useQuery({
    queryKey: searchKeys.results(query, options),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("q", query);

      if (options.limit) {
        params.set("limit", String(options.limit));
      }
      if (options.categories?.length) {
        params.set("categories", options.categories.join(","));
      }
      if (options.engines?.length) {
        params.set("engines", options.engines.join(","));
      }
      if (options.language) {
        params.set("language", options.language);
      }
      if (options.safesearch !== undefined) {
        params.set("safesearch", String(options.safesearch));
      }
      if (options.timeRange) {
        params.set("time_range", options.timeRange);
      }

      const url = `/api/extensions/search/search?${params.toString()}`;
      return apiClient<SearchResponse>(url);
    },
    enabled: !!query && query.length > 0,
    staleTime: 60000, // Cache results for 1 minute
  });
}

/**
 * Get search suggestions
 */
export function useSearchSuggestions(query: string) {
  return useQuery({
    queryKey: searchKeys.suggestions(query),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("q", query);

      const url = `/api/extensions/search/search/suggest?${params.toString()}`;
      return apiClient<string[]>(url);
    },
    enabled: !!query && query.length >= 2,
    staleTime: 60000,
  });
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Provision SearXNG container
 */
export function useProvisionSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiClient<SearchStatus>("/api/extensions/search/search/provision", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchKeys.status() });
      queryClient.invalidateQueries({ queryKey: searchKeys.available() });
    },
  });
}

/**
 * Stop SearXNG container
 */
export function useStopSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await apiClient("/api/extensions/search/search/stop", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchKeys.status() });
      queryClient.invalidateQueries({ queryKey: searchKeys.available() });
    },
  });
}

/**
 * Remove SearXNG container
 */
export function useRemoveSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await apiClient("/api/extensions/search/search/container", {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchKeys.status() });
      queryClient.invalidateQueries({ queryKey: searchKeys.available() });
    },
  });
}

/**
 * Search mutation for one-off searches (e.g., from sidebar input)
 */
export function useSearchMutation() {
  return useMutation({
    mutationFn: async ({
      query,
      options = {},
    }: {
      query: string;
      options?: SearchOptions;
    }) => {
      const params = new URLSearchParams();
      params.set("q", query);

      if (options.limit) {
        params.set("limit", String(options.limit));
      }
      if (options.categories?.length) {
        params.set("categories", options.categories.join(","));
      }
      if (options.timeRange) {
        params.set("time_range", options.timeRange);
      }

      const url = `/api/extensions/search/search?${params.toString()}`;
      return apiClient<SearchResponse>(url);
    },
  });
}
