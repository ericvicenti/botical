/**
 * useIrisMutation Hook Tests
 *
 * Tests for the mutation hook with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { useIrisMutation } from "./useIrisMutation";
import { useIrisQuery } from "./useIrisQuery";
import { WebSocketProvider } from "@/lib/websocket/context";
import type { Query, Mutation } from "./types";
import type { ReactNode } from "react";

// Test wrapper with React Query provider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
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

describe("useIrisMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes mutation successfully", async () => {
    server.use(
      http.post("/api/items", async ({ request }) => {
        const body = (await request.json()) as { name: string };
        // apiClient unwraps data.data
        return HttpResponse.json({ data: { id: "new-id", name: body.name } });
      })
    );

    const mutation: Mutation<{ name: string }, { id: string; name: string }> = {
      name: "items.create",
      endpoint: "/api/items",
      method: "POST",
    };

    const { result } = renderHook(() => useIrisMutation(mutation), {
      wrapper: createWrapper(),
    });

    // Initially not pending
    expect(result.current.isPending).toBe(false);

    // Execute mutation
    act(() => {
      result.current.mutate({ name: "Test Item" });
    });

    // Wait for completion
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "new-id", name: "Test Item" });
  });

  it("handles mutation with dynamic endpoint", async () => {
    server.use(
      http.put("/api/items/:id", async ({ params, request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ data: { id: params.id, name: body.name } });
      })
    );

    const mutation: Mutation<
      { id: string; name: string },
      { id: string; name: string }
    > = {
      name: "items.update",
      endpoint: (params) => `/api/items/${params.id}`,
      method: "PUT",
      body: (params) => ({ name: params.name }),
    };

    const { result } = renderHook(() => useIrisMutation(mutation), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ id: "123", name: "Updated" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "123", name: "Updated" });
  });

  it("handles mutation errors", async () => {
    server.use(
      http.post("/api/fail", () => {
        return HttpResponse.json(
          { error: { message: "Validation failed" } },
          { status: 400 }
        );
      })
    );

    const mutation: Mutation<{ data: string }, void> = {
      name: "items.fail",
      endpoint: "/api/fail",
      method: "POST",
    };

    const { result } = renderHook(() => useIrisMutation(mutation), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ data: "test" });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });

  it("calls onSuccess callback", async () => {
    server.use(
      http.post("/api/success-callback", () => {
        return HttpResponse.json({ data: { id: "new" } });
      })
    );

    const mutation: Mutation<void, { id: string }> = {
      name: "items.callback",
      endpoint: "/api/success-callback",
      method: "POST",
    };

    const onSuccess = vi.fn();

    const { result } = renderHook(
      () => useIrisMutation(mutation, { onSuccess }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalledWith({ id: "new" });
  });

  it("calls onError callback", async () => {
    server.use(
      http.post("/api/error-callback", () => {
        return HttpResponse.json({ error: { message: "Error" } }, { status: 500 });
      })
    );

    const mutation: Mutation<void, void> = {
      name: "items.errorcallback",
      endpoint: "/api/error-callback",
      method: "POST",
    };

    const onError = vi.fn();

    const { result } = renderHook(() => useIrisMutation(mutation, { onError }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onError).toHaveBeenCalled();
  });

  it("calls onSettled callback after success", async () => {
    server.use(
      http.post("/api/settled", () => {
        return HttpResponse.json({ data: { done: true } });
      })
    );

    const mutation: Mutation<void, { done: boolean }> = {
      name: "items.settled",
      endpoint: "/api/settled",
      method: "POST",
    };

    const onSettled = vi.fn();

    const { result } = renderHook(
      () => useIrisMutation(mutation, { onSettled }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSettled).toHaveBeenCalled();
  });

  it("provides mutateAsync for promise-based usage", async () => {
    server.use(
      http.post("/api/async", () => {
        return HttpResponse.json({ data: { result: "async-result" } });
      })
    );

    const mutation: Mutation<void, { result: string }> = {
      name: "items.async",
      endpoint: "/api/async",
      method: "POST",
    };

    const { result } = renderHook(() => useIrisMutation(mutation), {
      wrapper: createWrapper(),
    });

    let asyncResult: { result: string } | undefined;

    await act(async () => {
      asyncResult = await result.current.mutateAsync(undefined);
    });

    expect(asyncResult).toEqual({ result: "async-result" });
  });

  it("provides reset function", async () => {
    server.use(
      http.post("/api/resettable", () => {
        return HttpResponse.json({ data: { id: "123" } });
      })
    );

    const mutation: Mutation<void, { id: string }> = {
      name: "items.resettable",
      endpoint: "/api/resettable",
      method: "POST",
    };

    const { result } = renderHook(() => useIrisMutation(mutation), {
      wrapper: createWrapper(),
    });

    // Execute mutation
    act(() => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();

    // Reset
    act(() => {
      result.current.reset();
    });

    // Wait for reset to take effect
    await waitFor(() => {
      expect(result.current.data).toBeUndefined();
    });

    expect(result.current.isSuccess).toBe(false);
  });

  it("invalidates queries after mutation", async () => {
    let listFetchCount = 0;

    server.use(
      http.get("/api/items", () => {
        listFetchCount++;
        // apiClient unwraps data.data
        return HttpResponse.json({ data: [`item-${listFetchCount}`] });
      }),
      http.post("/api/items", () => {
        return HttpResponse.json({ data: { id: "new" } });
      })
    );

    const listQuery: Query<string[], void> = {
      name: "items.list",
      endpoint: "/api/items",
    };

    const createMutation: Mutation<void, { id: string }> = {
      name: "items.create",
      endpoint: "/api/items",
      method: "POST",
      invalidates: ["items.list"],
    };

    const wrapper = createWrapper();

    // First, render the query to populate cache
    const { result: queryResult } = renderHook(
      () => useIrisQuery(listQuery, undefined),
      { wrapper }
    );

    await waitFor(() => {
      expect(queryResult.current.data).toContain("item-1");
    });

    expect(listFetchCount).toBe(1);

    // Now render and execute the mutation
    const { result: mutationResult } = renderHook(
      () => useIrisMutation(createMutation),
      { wrapper }
    );

    act(() => {
      mutationResult.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true);
    });

    // The list should have been invalidated and refetched
    await waitFor(() => {
      expect(listFetchCount).toBeGreaterThan(1);
    });
  });

  it("supports DELETE method", async () => {
    server.use(
      http.delete("/api/items/:id", ({ params }) => {
        return HttpResponse.json({ data: { deleted: params.id } });
      })
    );

    const mutation: Mutation<{ id: string }, { deleted: string }> = {
      name: "items.delete",
      endpoint: (params) => `/api/items/${params.id}`,
      method: "DELETE",
    };

    const { result } = renderHook(() => useIrisMutation(mutation), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ id: "456" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ deleted: "456" });
  });

  it("supports PATCH method", async () => {
    server.use(
      http.patch("/api/items/:id", async ({ params, request }) => {
        const body = (await request.json()) as { field: string };
        return HttpResponse.json({ data: { id: params.id, ...body } });
      })
    );

    const mutation: Mutation<
      { id: string; field: string },
      { id: string; field: string }
    > = {
      name: "items.patch",
      endpoint: (params) => `/api/items/${params.id}`,
      method: "PATCH",
      body: (params) => ({ field: params.field }),
    };

    const { result } = renderHook(() => useIrisMutation(mutation), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ id: "789", field: "updated-value" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "789", field: "updated-value" });
  });
});
