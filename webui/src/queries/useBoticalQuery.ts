/**
 * useBoticalQuery Hook
 *
 * React hook for executing queries with caching, real-time updates,
 * and automatic refetching.
 */

import { useEffect, useCallback } from "react";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket/context";
import { apiClient } from "@/lib/api/client";
import type { Query, QueryState, UseQueryOptions } from "./types";
import { useQueryDefinition } from "./QueryProvider";

/**
 * Generate cache key for a query
 */
function getCacheKey<P>(query: Query<unknown, P>, params: P): string[] {
  if (query.cache?.key) {
    return query.cache.key(params);
  }

  // Default key generation
  const baseKey = [query.name];
  if (params && typeof params === "object") {
    const paramKeys = Object.entries(params as Record<string, unknown>)
      .filter(([_, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${String(v)}`);
    return [...baseKey, ...paramKeys];
  }
  return baseKey;
}

/**
 * Build the API URL for a query
 */
function buildQueryUrl<P>(query: Query<unknown, P>, params: P): string {
  const endpoint =
    typeof query.endpoint === "function"
      ? query.endpoint(params)
      : query.endpoint;

  // Add query params if method is GET and params transformer exists
  if (query.method !== "POST" && query.params) {
    const queryParams = query.params(params);
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    return queryString ? `${endpoint}?${queryString}` : endpoint;
  }

  return endpoint;
}

/**
 * Fetch data for a query
 */
async function fetchQuery<T, P>(query: Query<T, P>, params: P): Promise<T> {
  const url = buildQueryUrl(query, params);

  if (query.method === "POST") {
    const body = query.params ? query.params(params) : undefined;
    return apiClient<T>(url, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  return apiClient<T>(url);
}

/**
 * useBoticalQuery hook
 *
 * Fetches data using the query definition with:
 * - Automatic caching via TanStack Query
 * - Real-time updates via WebSocket
 * - Type-safe params and return types
 */
export function useBoticalQuery<T, P>(
  query: Query<T, P>,
  params: P,
  options: UseQueryOptions = {}
): QueryState<T> {
  const resolvedQuery = useQueryDefinition(query);
  const { subscribe, unsubscribe } = useWebSocket();

  // Generate cache key
  const queryKey = getCacheKey(resolvedQuery, params);

  // Set up real-time subscription
  // Note: The WebSocket context's subscribe/unsubscribe manages channel subscriptions.
  // Query invalidation happens automatically in handleWebSocketEvent based on event type.
  useEffect(() => {
    if (!resolvedQuery.realtime?.events?.length) return;

    // Subscribe to each event channel
    resolvedQuery.realtime.events.forEach((event) => {
      subscribe(event);
    });

    return () => {
      // Unsubscribe from each event channel
      resolvedQuery.realtime?.events?.forEach((event) => {
        unsubscribe(event);
      });
    };
  }, [resolvedQuery.realtime?.events?.join(","), subscribe, unsubscribe]);

  // Execute query via TanStack Query
  const result: UseQueryResult<T, Error> = useQuery({
    queryKey,
    queryFn: () => fetchQuery(resolvedQuery, params),
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? resolvedQuery.cache?.ttl ?? 60_000,
    refetchInterval: options.refetchInterval,
  });

  // Refetch callback
  const refetch = useCallback(async () => {
    await result.refetch();
  }, [result.refetch]);

  return {
    data: result.data,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    isFetching: result.isFetching,
    isStale: result.isStale,
    refetch,
  };
}

/**
 * Prefetch a query (for route preloading)
 */
export async function prefetchBoticalQuery<T, P>(
  queryClient: ReturnType<typeof useQueryClient>,
  query: Query<T, P>,
  params: P
): Promise<void> {
  const queryKey = getCacheKey(query, params);
  await queryClient.prefetchQuery({
    queryKey,
    queryFn: () => fetchQuery(query, params),
    staleTime: query.cache?.ttl ?? 60_000,
  });
}
