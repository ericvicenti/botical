/**
 * Query Types Unit Tests
 *
 * Tests for type definitions and type guards.
 */

import { describe, it, expect } from "bun:test";
import type {
  Query,
  Mutation,
  QueryContext,
  MutationContext,
  QueryResult,
  QueryState,
  MutationState,
  QueryCacheConfig,
  CacheScope,
  PaginationParams,
  PaginatedResult,
} from "@/queries/types.ts";

describe("Query type structure", () => {
  it("allows minimal query definition", () => {
    const query: Query<string, void> = {
      name: "test.query",
      fetch: async () => "result",
    };

    expect(query.name).toBe("test.query");
    expect(query.cache).toBeUndefined();
  });

  it("allows query with all options", () => {
    const query: Query<string[], { projectId: string }> = {
      name: "test.full",
      fetch: async (params) => [`project: ${params.projectId}`],
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
    expect(query.cache?.scope).toBe("project");
    expect(query.realtime?.events).toContain("test.updated");
    expect(query.pagination?.defaultLimit).toBe(10);
  });

  it("supports void params type", async () => {
    const query: Query<number, void> = {
      name: "test.void",
      fetch: async () => 42,
    };

    const result = await query.fetch(undefined, {});
    expect(result).toBe(42);
  });
});

describe("Mutation type structure", () => {
  it("allows minimal mutation definition", () => {
    const mutation: Mutation<void, { id: string }, void> = {
      name: "test.delete",
      execute: async () => {},
    };

    expect(mutation.name).toBe("test.delete");
    expect(mutation.invalidates).toBeUndefined();
  });

  it("allows mutation with invalidation", () => {
    const targetQuery: Query<string, void> = {
      name: "test.target",
      fetch: async () => "data",
    };

    const mutation: Mutation<void, { data: string }, string> = {
      name: "test.create",
      execute: async (params) => params.data,
      invalidates: [targetQuery],
      invalidateKeys: (params, result) => [["custom", result]],
      description: "Creates something",
    };

    expect(mutation.invalidates).toHaveLength(1);
    expect(mutation.invalidates?.[0].name).toBe("test.target");
    expect(mutation.invalidateKeys).toBeDefined();
  });
});

describe("QueryContext structure", () => {
  it("allows empty context", () => {
    const context: QueryContext = {};
    expect(context.db).toBeUndefined();
  });

  it("allows context with all fields", () => {
    const context: QueryContext = {
      projectId: "prj_123",
      requestId: "req_456",
    };

    expect(context.projectId).toBe("prj_123");
    expect(context.requestId).toBe("req_456");
  });
});

describe("MutationContext structure", () => {
  it("extends QueryContext", () => {
    const context: MutationContext = {
      projectId: "prj_123",
      userId: "usr_789",
    };

    expect(context.projectId).toBe("prj_123");
    expect(context.userId).toBe("usr_789");
  });
});

describe("QueryResult structure", () => {
  it("contains required fields", () => {
    const result: QueryResult<string> = {
      data: "test data",
      fetchedAt: Date.now(),
      fromCache: false,
    };

    expect(result.data).toBe("test data");
    expect(result.fetchedAt).toBeGreaterThan(0);
    expect(result.fromCache).toBe(false);
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

  it("allows Infinity TTL", () => {
    const config: QueryCacheConfig<void> = {
      ttl: Infinity,
    };

    expect(config.ttl).toBe(Infinity);
  });
});

describe("Pagination types", () => {
  it("PaginationParams has optional fields", () => {
    const empty: PaginationParams = {};
    const full: PaginationParams = { limit: 10, offset: 20 };

    expect(empty.limit).toBeUndefined();
    expect(full.limit).toBe(10);
    expect(full.offset).toBe(20);
  });

  it("PaginatedResult has meta info", () => {
    const result: PaginatedResult<string> = {
      data: ["a", "b", "c"],
      meta: {
        total: 100,
        limit: 10,
        offset: 0,
        hasMore: true,
      },
    };

    expect(result.data).toHaveLength(3);
    expect(result.meta.total).toBe(100);
    expect(result.meta.hasMore).toBe(true);
  });
});

describe("State types", () => {
  it("QueryState has all required fields", () => {
    const state: QueryState<string> = {
      data: "test",
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      isStale: false,
    };

    expect(state.data).toBe("test");
    expect(state.isLoading).toBe(false);
  });

  it("MutationState has all required fields", () => {
    const state: MutationState<string> = {
      data: "result",
      isPending: false,
      isError: false,
      error: null,
      isSuccess: true,
    };

    expect(state.data).toBe("result");
    expect(state.isSuccess).toBe(true);
  });
});
