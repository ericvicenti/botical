/**
 * Query Types Unit Tests (Frontend)
 *
 * Tests for frontend query type definitions.
 */

import { describe, it, expect } from "vitest";
import type {
  Query,
  Mutation,
  QueryState,
  MutationState,
  QueryCacheConfig,
  QueryRealtimeConfig,
  CacheScope,
  UseQueryOptions,
  UseMutationOptions,
} from "./types";

describe("Query type structure (frontend)", () => {
  it("allows minimal query definition with endpoint", () => {
    const query: Query<string, void> = {
      name: "test.query",
      endpoint: "/api/test",
    };

    expect(query.name).toBe("test.query");
    expect(query.endpoint).toBe("/api/test");
  });

  it("allows query with dynamic endpoint", () => {
    const query: Query<string, { id: string }> = {
      name: "test.dynamic",
      endpoint: (params) => `/api/items/${params.id}`,
    };

    expect(typeof query.endpoint).toBe("function");
    if (typeof query.endpoint === "function") {
      expect(query.endpoint({ id: "123" })).toBe("/api/items/123");
    }
  });

  it("allows query with all options", () => {
    const query: Query<string[], { projectId: string }> = {
      name: "test.full",
      endpoint: (params) => `/api/projects/${params.projectId}/items`,
      method: "GET",
      params: (p) => ({ project: p.projectId }),
      cache: {
        ttl: 5000,
        scope: "project",
        key: (params) => ["test", params.projectId],
      },
      realtime: {
        events: ["test.updated"],
      },
      pagination: {
        defaultLimit: 10,
        maxLimit: 100,
      },
      description: "A test query",
    };

    expect(query.cache?.ttl).toBe(5000);
    expect(query.realtime?.events).toContain("test.updated");
  });

  it("supports POST method for queries", () => {
    const query: Query<string, { data: Record<string, unknown> }> = {
      name: "test.post",
      endpoint: "/api/search",
      method: "POST",
      params: (p) => p.data,
    };

    expect(query.method).toBe("POST");
  });
});

describe("Mutation type structure (frontend)", () => {
  it("allows minimal mutation definition", () => {
    const mutation: Mutation<{ id: string }, void> = {
      name: "test.delete",
      endpoint: (params) => `/api/items/${params.id}`,
      method: "DELETE",
    };

    expect(mutation.name).toBe("test.delete");
    expect(mutation.method).toBe("DELETE");
  });

  it("allows mutation with all options", () => {
    const mutation: Mutation<{ data: string }, { id: string }> = {
      name: "test.create",
      endpoint: "/api/items",
      method: "POST",
      body: (p) => ({ value: p.data }),
      invalidates: ["items.list"],
      invalidateKeys: (_params, result) => [["items", result.id]],
      description: "Creates an item",
    };

    expect(mutation.invalidates).toContain("items.list");
    expect(mutation.invalidateKeys).toBeDefined();
  });

  it("supports all HTTP methods", () => {
    const methods: Array<Mutation<unknown, unknown>["method"]> = [
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
    ];

    methods.forEach((method) => {
      const mutation: Mutation<unknown, unknown> = {
        name: `test.${method?.toLowerCase()}`,
        endpoint: "/api/test",
        method,
      };
      expect(mutation.method).toBe(method);
    });
  });
});

describe("QueryState structure", () => {
  it("has all required fields", () => {
    const state: QueryState<string> = {
      data: "test",
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      isStale: false,
      refetch: async () => {},
    };

    expect(state.data).toBe("test");
    expect(state.isLoading).toBe(false);
    expect(typeof state.refetch).toBe("function");
  });

  it("allows undefined data during loading", () => {
    const state: QueryState<string> = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: true,
      isStale: false,
      refetch: async () => {},
    };

    expect(state.data).toBeUndefined();
    expect(state.isLoading).toBe(true);
  });

  it("includes error when isError is true", () => {
    const state: QueryState<string> = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to fetch"),
      isFetching: false,
      isStale: false,
      refetch: async () => {},
    };

    expect(state.isError).toBe(true);
    expect(state.error?.message).toBe("Failed to fetch");
  });
});

describe("MutationState structure", () => {
  it("has all required fields", () => {
    const state: MutationState<{ id: string }, string> = {
      mutate: () => {},
      mutateAsync: async () => "result",
      data: "result",
      isPending: false,
      isError: false,
      error: null,
      isSuccess: true,
      reset: () => {},
    };

    expect(state.data).toBe("result");
    expect(state.isSuccess).toBe(true);
    expect(typeof state.mutate).toBe("function");
    expect(typeof state.mutateAsync).toBe("function");
    expect(typeof state.reset).toBe("function");
  });

  it("shows pending state during mutation", () => {
    const state: MutationState<void, void> = {
      mutate: () => {},
      mutateAsync: async () => {},
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      isSuccess: false,
      reset: () => {},
    };

    expect(state.isPending).toBe(true);
    expect(state.isSuccess).toBe(false);
  });
});

describe("CacheScope type", () => {
  it("accepts valid scopes", () => {
    const scopes: CacheScope[] = ["global", "project", "session"];
    expect(scopes).toHaveLength(3);
  });
});

describe("QueryCacheConfig structure", () => {
  it("allows all config options", () => {
    const config: QueryCacheConfig<{ id: string }> = {
      ttl: 60000,
      scope: "project",
      key: (params) => ["prefix", params.id],
    };

    expect(config.ttl).toBe(60000);
    expect(config.scope).toBe("project");
    expect(config.key?.({ id: "test" })).toEqual(["prefix", "test"]);
  });
});

describe("QueryRealtimeConfig structure", () => {
  it("allows event-based invalidation", () => {
    const config: QueryRealtimeConfig<string, void> = {
      events: ["item.created", "item.updated", "item.deleted"],
    };

    expect(config.events).toHaveLength(3);
  });

  it("allows custom subscription", () => {
    const config: QueryRealtimeConfig<string, { id: string }> = {
      subscribe: (_params, _onData, _onError) => {
        // Simulate subscription
        return () => {}; // Cleanup function
      },
    };

    expect(typeof config.subscribe).toBe("function");
  });
});

describe("UseQueryOptions structure", () => {
  it("allows all options", () => {
    const options: UseQueryOptions = {
      enabled: true,
      staleTime: 30000,
      refetchInterval: 5000,
    };

    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(30000);
    expect(options.refetchInterval).toBe(5000);
  });

  it("all options are optional", () => {
    const options: UseQueryOptions = {};
    expect(options.enabled).toBeUndefined();
  });
});

describe("UseMutationOptions structure", () => {
  it("allows callback options", () => {
    let successCalled = false;
    let errorCalled = false;
    let settledCalled = false;

    const options: UseMutationOptions<string> = {
      onSuccess: (result) => {
        successCalled = true;
        expect(result).toBe("test");
      },
      onError: (_error) => {
        errorCalled = true;
      },
      onSettled: () => {
        settledCalled = true;
      },
    };

    options.onSuccess?.("test");
    options.onError?.(new Error("test"));
    options.onSettled?.();

    expect(successCalled).toBe(true);
    expect(errorCalled).toBe(true);
    expect(settledCalled).toBe(true);
  });
});
