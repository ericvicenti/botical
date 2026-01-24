/**
 * useIrisQuery Hook Tests
 *
 * Tests for the query hook with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { useIrisQuery } from "./useIrisQuery";
import { WebSocketProvider } from "@/lib/websocket/context";
import type { Query } from "./types";
import type { ReactNode } from "react";

// Test wrapper with React Query provider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>{children}</WebSocketProvider>
      </QueryClientProvider>
    );
  };
}

describe("useIrisQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches data successfully", async () => {
    // Set up mock endpoint
    server.use(
      http.get("/api/test/items", () => {
        // apiClient unwraps data.data, so we return { data: [...] }
        return HttpResponse.json({ data: ["item1", "item2"] });
      })
    );

    const query: Query<string[], void> = {
      name: "test.items",
      endpoint: "/api/test/items",
    };

    const { result } = renderHook(() => useIrisQuery(query, undefined), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for data
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // apiClient returns data.data, so we get the array directly
    expect(result.current.data).toEqual(["item1", "item2"]);
    expect(result.current.isError).toBe(false);
  });

  it("handles query with params", async () => {
    server.use(
      http.get("/api/items/:id", ({ params }) => {
        return HttpResponse.json({ id: params.id, name: "Test Item" });
      })
    );

    const query: Query<{ id: string; name: string }, { id: string }> = {
      name: "test.item",
      endpoint: (params) => `/api/items/${params.id}`,
    };

    const { result } = renderHook(() => useIrisQuery(query, { id: "123" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ id: "123", name: "Test Item" });
  });

  it("handles query params in URL", async () => {
    server.use(
      http.get("/api/search", ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q");
        // Return in structure that apiClient expects
        return HttpResponse.json({ data: { results: [`result for ${q}`] } });
      })
    );

    const query: Query<{ results: string[] }, { search: string }> = {
      name: "test.search",
      endpoint: "/api/search",
      params: (p) => ({ q: p.search }),
    };

    const { result } = renderHook(
      () => useIrisQuery(query, { search: "hello" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.results).toContain("result for hello");
  });

  it("handles POST method queries", async () => {
    server.use(
      http.post("/api/complex-query", async ({ request }) => {
        const body = (await request.json()) as { filters: string[] };
        return HttpResponse.json({ data: { filtered: body.filters } });
      })
    );

    const query: Query<{ filtered: string[] }, { filters: string[] }> = {
      name: "test.complex",
      endpoint: "/api/complex-query",
      method: "POST",
      params: (p) => ({ filters: p.filters }),
    };

    const { result } = renderHook(
      () => useIrisQuery(query, { filters: ["a", "b"] }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.filtered).toEqual(["a", "b"]);
  });

  it("handles errors", async () => {
    server.use(
      http.get("/api/error", () => {
        return HttpResponse.json(
          { error: { message: "Not found" } },
          { status: 404 }
        );
      })
    );

    const query: Query<unknown, void> = {
      name: "test.error",
      endpoint: "/api/error",
    };

    const { result } = renderHook(() => useIrisQuery(query, undefined), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeDefined();
  });

  it("respects enabled option", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/conditional", () => {
        fetchCount++;
        return HttpResponse.json({ data: "test" });
      })
    );

    const query: Query<string, void> = {
      name: "test.conditional",
      endpoint: "/api/conditional",
    };

    const { result, rerender } = renderHook(
      ({ enabled }) => useIrisQuery(query, undefined, { enabled }),
      {
        wrapper: createWrapper(),
        initialProps: { enabled: false },
      }
    );

    // Should not fetch when disabled
    expect(result.current.isLoading).toBe(false);
    expect(fetchCount).toBe(0);

    // Enable the query
    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(fetchCount).toBe(1);
  });

  it("provides refetch function", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/refetchable", () => {
        fetchCount++;
        return HttpResponse.json({ data: { count: fetchCount } });
      })
    );

    const query: Query<{ count: number }, void> = {
      name: "test.refetchable",
      endpoint: "/api/refetchable",
    };

    const { result } = renderHook(() => useIrisQuery(query, undefined), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.count).toBe(1);
    });

    // Trigger refetch
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.data?.count).toBe(2);
    });

    expect(fetchCount).toBe(2);
  });

  it("uses cache key from params", async () => {
    const responses: Record<string, string> = {
      "1": "Data for 1",
      "2": "Data for 2",
    };

    server.use(
      http.get("/api/keyed/:id", ({ params }) => {
        // apiClient unwraps data.data
        return HttpResponse.json({ data: responses[params.id as string] });
      })
    );

    const query: Query<string, { id: string }> = {
      name: "test.keyed",
      endpoint: (params) => `/api/keyed/${params.id}`,
      cache: {
        ttl: 60000,
      },
    };

    const wrapper = createWrapper();

    // First query with id=1
    const { result: result1 } = renderHook(
      () => useIrisQuery(query, { id: "1" }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result1.current.data).toBe("Data for 1");
    });

    // Second query with id=2 (different cache key)
    const { result: result2 } = renderHook(
      () => useIrisQuery(query, { id: "2" }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result2.current.data).toBe("Data for 2");
    });
  });

  it("respects staleTime option", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/stale-test", () => {
        fetchCount++;
        return HttpResponse.json({ data: { count: fetchCount } });
      })
    );

    const query: Query<{ count: number }, void> = {
      name: "test.staletime",
      endpoint: "/api/stale-test",
      cache: {
        ttl: 60000, // 1 minute
      },
    };

    const wrapper = createWrapper();

    // First render
    const { result: result1, unmount } = renderHook(
      () => useIrisQuery(query, undefined),
      { wrapper }
    );

    await waitFor(() => {
      expect(result1.current.data?.count).toBe(1);
    });

    unmount();

    // Second render - should use cached data
    const { result: result2 } = renderHook(
      () => useIrisQuery(query, undefined, { staleTime: 60000 }),
      { wrapper }
    );

    // Should have cached data immediately
    await waitFor(() => {
      expect(result2.current.data?.count).toBe(1);
    });

    // Should not have refetched (still using stale data)
    expect(fetchCount).toBe(1);
  });
});
