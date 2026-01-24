/**
 * Query Executor Unit Tests
 *
 * Tests for executeQuery, executeMutation, and related functions.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  executeQuery,
  executeMutation,
  invalidateQuery,
  invalidateQueryWithParams,
  prefetchQuery,
} from "@/queries/executor.ts";
import { defineQuery, defineMutation } from "@/queries/define.ts";
import { QueryCache, resetGlobalCache } from "@/queries/cache.ts";
import type { Query, QueryContext, MutationContext } from "@/queries/types.ts";

describe("executeQuery", () => {
  let cache: QueryCache;
  const context: QueryContext = { projectId: "test-project" };

  beforeEach(() => {
    cache = new QueryCache(1000000);
  });

  afterEach(() => {
    cache.destroy();
    resetGlobalCache();
  });

  it("executes the query fetch function", async () => {
    let fetchCalled = false;
    const query = defineQuery({
      name: "test.fetch",
      fetch: async () => {
        fetchCalled = true;
        return "result";
      },
    });

    const result = await executeQuery(query, undefined, context, { cache });

    expect(fetchCalled).toBe(true);
    expect(result.data).toBe("result");
    expect(result.fromCache).toBe(false);
  });

  it("passes params and context to fetch", async () => {
    const query = defineQuery({
      name: "test.params",
      fetch: async (params: { id: string }, ctx) => {
        return `${params.id}-${ctx.projectId}`;
      },
    });

    const result = await executeQuery(query, { id: "123" }, context, { cache });

    expect(result.data).toBe("123-test-project");
  });

  it("caches query results when cache is configured", async () => {
    let fetchCount = 0;
    const query = defineQuery({
      name: "test.cached",
      fetch: async () => {
        fetchCount++;
        return "cached-data";
      },
      cache: { ttl: 60000 },
    });

    // First call - should fetch
    const result1 = await executeQuery(query, undefined, context, { cache });
    expect(result1.fromCache).toBe(false);
    expect(fetchCount).toBe(1);

    // Second call - should return from cache
    const result2 = await executeQuery(query, undefined, context, { cache });
    expect(result2.fromCache).toBe(true);
    expect(result2.data).toBe("cached-data");
    expect(fetchCount).toBe(1);
  });

  it("respects skipCache option", async () => {
    let fetchCount = 0;
    const query = defineQuery({
      name: "test.skipcache",
      fetch: async () => {
        fetchCount++;
        return `result-${fetchCount}`;
      },
      cache: { ttl: 60000 },
    });

    // First call
    await executeQuery(query, undefined, context, { cache });
    expect(fetchCount).toBe(1);

    // Second call with skipCache
    const result = await executeQuery(query, undefined, context, {
      cache,
      skipCache: true,
    });
    expect(result.fromCache).toBe(false);
    expect(result.data).toBe("result-2");
    expect(fetchCount).toBe(2);
  });

  it("does not cache when cache config is not provided", async () => {
    let fetchCount = 0;
    const query: Query<string, void> = {
      name: "test.nocache",
      fetch: async () => {
        fetchCount++;
        return "data";
      },
    };

    await executeQuery(query, undefined, context, { cache });
    await executeQuery(query, undefined, context, { cache });

    expect(fetchCount).toBe(2);
  });

  it("uses different cache keys for different params", async () => {
    let fetchCount = 0;
    const query = defineQuery({
      name: "test.keyparams",
      fetch: async (params: { id: string }) => {
        fetchCount++;
        return `data-${params.id}`;
      },
      cache: { ttl: 60000 },
    });

    const result1 = await executeQuery(query, { id: "1" }, context, { cache });
    const result2 = await executeQuery(query, { id: "2" }, context, { cache });
    const result3 = await executeQuery(query, { id: "1" }, context, { cache });

    expect(fetchCount).toBe(2); // Only 2 fetches (id:1 cached on second call)
    expect(result1.data).toBe("data-1");
    expect(result2.data).toBe("data-2");
    expect(result3.fromCache).toBe(true);
  });

  it("records fetchedAt timestamp", async () => {
    const before = Date.now();
    const query = defineQuery({
      name: "test.timestamp",
      fetch: async () => "data",
    });

    const result = await executeQuery(query, undefined, context, { cache });
    const after = Date.now();

    expect(result.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(result.fetchedAt).toBeLessThanOrEqual(after);
  });

  it("handles fetch errors", async () => {
    const query = defineQuery({
      name: "test.error",
      fetch: async () => {
        throw new Error("Fetch failed");
      },
    });

    await expect(
      executeQuery(query, undefined, context, { cache })
    ).rejects.toThrow("Fetch failed");
  });
});

describe("executeMutation", () => {
  let cache: QueryCache;
  const context: MutationContext = { projectId: "test-project", userId: "user-1" };

  beforeEach(() => {
    cache = new QueryCache(1000000);
  });

  afterEach(() => {
    cache.destroy();
    resetGlobalCache();
  });

  it("executes the mutation function", async () => {
    let executed = false;
    const mutation = defineMutation({
      name: "test.execute",
      execute: async () => {
        executed = true;
      },
    });

    await executeMutation(mutation, {}, context, { cache });

    expect(executed).toBe(true);
  });

  it("passes params and context to execute", async () => {
    const mutation = defineMutation({
      name: "test.mutparams",
      execute: async (params: { value: string }, ctx) => {
        return `${params.value}-${ctx.userId}`;
      },
    });

    const result = await executeMutation(
      mutation,
      { value: "test" },
      context,
      { cache }
    );

    expect(result).toBe("test-user-1");
  });

  it("invalidates related queries by name", async () => {
    // Populate cache
    cache.set(["target.query"], "cached", 60000);
    cache.set(["target.query", "id:1"], "cached-1", 60000);

    const mutation = defineMutation({
      name: "test.invalidate",
      execute: async () => {},
      invalidates: ["target.query"],
    });

    await executeMutation(mutation, {}, context, { cache });

    // Both entries should be invalidated
    expect(cache.get(["target.query"])).toBeUndefined();
    expect(cache.get(["target.query", "id:1"])).toBeUndefined();
  });

  it("invalidates specific keys when invalidateKeys is provided", async () => {
    // Populate cache
    cache.set(["items", "id:1"], "item-1", 60000);
    cache.set(["items", "id:2"], "item-2", 60000);
    cache.set(["items", "id:3"], "item-3", 60000);

    const mutation = defineMutation({
      name: "test.invalidatekeys",
      execute: async (params: { ids: string[] }) => params.ids,
      invalidateKeys: (params, result) =>
        result.map((id) => ["items", `id:${id}`]),
    });

    await executeMutation(mutation, { ids: ["1", "3"] }, context, { cache });

    // Only ids 1 and 3 should be invalidated
    expect(cache.get(["items", "id:1"])).toBeUndefined();
    expect(cache.get(["items", "id:2"])).toBeDefined();
    expect(cache.get(["items", "id:3"])).toBeUndefined();
  });

  it("handles mutation errors", async () => {
    const mutation = defineMutation({
      name: "test.muterror",
      execute: async () => {
        throw new Error("Mutation failed");
      },
    });

    await expect(
      executeMutation(mutation, {}, context, { cache })
    ).rejects.toThrow("Mutation failed");
  });

  it("returns mutation result", async () => {
    const mutation = defineMutation({
      name: "test.result",
      execute: async (params: { data: string }) => ({
        id: "new-id",
        data: params.data,
      }),
    });

    const result = await executeMutation(
      mutation,
      { data: "test-data" },
      context,
      { cache }
    );

    expect(result).toEqual({ id: "new-id", data: "test-data" });
  });
});

describe("invalidateQuery", () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache(1000000);
  });

  afterEach(() => {
    cache.destroy();
  });

  it("invalidates all entries for a query name", () => {
    cache.set(["users"], "all-users", 60000);
    cache.set(["users", "id:1"], "user-1", 60000);
    cache.set(["users", "id:2"], "user-2", 60000);
    cache.set(["projects"], "all-projects", 60000);

    const count = invalidateQuery("users", cache);

    expect(count).toBe(3);
    expect(cache.get(["users"])).toBeUndefined();
    expect(cache.get(["users", "id:1"])).toBeUndefined();
    expect(cache.get(["users", "id:2"])).toBeUndefined();
    expect(cache.get(["projects"])).toBeDefined();
  });
});

describe("invalidateQueryWithParams", () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache(1000000);
  });

  afterEach(() => {
    cache.destroy();
  });

  it("invalidates specific cached entry", () => {
    const query = defineQuery({
      name: "test.specific",
      fetch: async () => "data",
      cache: {
        key: (params: { id: string }) => ["test.specific", params.id],
      },
    });

    cache.set(["test.specific", "1"], "data-1", 60000);
    cache.set(["test.specific", "2"], "data-2", 60000);

    const deleted = invalidateQueryWithParams(query, { id: "1" }, cache);

    expect(deleted).toBe(true);
    expect(cache.get(["test.specific", "1"])).toBeUndefined();
    expect(cache.get(["test.specific", "2"])).toBeDefined();
  });
});

describe("prefetchQuery", () => {
  let cache: QueryCache;
  const context: QueryContext = {};

  beforeEach(() => {
    cache = new QueryCache(1000000);
  });

  afterEach(() => {
    cache.destroy();
  });

  it("executes query and caches result", async () => {
    let fetchCalled = false;
    const query = defineQuery({
      name: "test.prefetch",
      fetch: async () => {
        fetchCalled = true;
        return "prefetched-data";
      },
      cache: { ttl: 60000 },
    });

    await prefetchQuery(query, undefined, context, cache);

    expect(fetchCalled).toBe(true);

    // Verify it's cached by checking cache directly
    const entry = cache.get(["test.prefetch"]);
    expect(entry).toBeDefined();
    expect(entry!.data).toBe("prefetched-data");
  });

  it("returns void (doesn't return the data)", async () => {
    const query = defineQuery({
      name: "test.prefetchvoid",
      fetch: async () => "data",
      cache: { ttl: 60000 },
    });

    const result = await prefetchQuery(query, undefined, context, cache);

    expect(result).toBeUndefined();
  });
});
