/**
 * Query Definition Helper Unit Tests
 *
 * Tests for defineQuery, defineMutation, and helper functions.
 */

import { describe, it, expect } from "bun:test";
import {
  defineQuery,
  defineMutation,
  createCacheKey,
  getQueryTTL,
  isQueryStale,
} from "@/queries/define.ts";
import type { Query, Mutation } from "@/queries/types.ts";

describe("defineQuery", () => {
  it("returns the query definition", () => {
    const query = defineQuery<string, void>({
      name: "test.simple",
      fetch: async () => "result",
    });

    expect(query.name).toBe("test.simple");
  });

  it("validates query name format", () => {
    expect(() =>
      defineQuery({
        name: "Invalid-Name",
        fetch: async () => "result",
      })
    ).toThrow(/Invalid query name/);

    expect(() =>
      defineQuery({
        name: "UPPERCASE",
        fetch: async () => "result",
      })
    ).toThrow(/Invalid query name/);

    expect(() =>
      defineQuery({
        name: "with spaces",
        fetch: async () => "result",
      })
    ).toThrow(/Invalid query name/);
  });

  it("accepts valid namespaced names", () => {
    const q1 = defineQuery({ name: "simple", fetch: async () => {} });
    const q2 = defineQuery({ name: "namespace.query", fetch: async () => {} });
    const q3 = defineQuery({
      name: "deep.nested.query",
      fetch: async () => {},
    });
    const q4 = defineQuery({
      name: "with123numbers",
      fetch: async () => {},
    });

    expect(q1.name).toBe("simple");
    expect(q2.name).toBe("namespace.query");
    expect(q3.name).toBe("deep.nested.query");
    expect(q4.name).toBe("with123numbers");
  });

  it("applies default cache config when cache is provided", () => {
    const query = defineQuery({
      name: "test.cached",
      fetch: async () => "data",
      cache: {
        scope: "project",
      },
    });

    // Default TTL should be applied
    expect(query.cache?.ttl).toBe(60000);
    expect(query.cache?.scope).toBe("project");
  });

  it("overrides default TTL when specified", () => {
    const query = defineQuery({
      name: "test.customttl",
      fetch: async () => "data",
      cache: {
        ttl: 5000,
      },
    });

    expect(query.cache?.ttl).toBe(5000);
  });

  it("generates default cache key function when not provided", () => {
    const query = defineQuery({
      name: "test.autokey",
      fetch: async () => "data",
      cache: {},
    });

    expect(query.cache?.key).toBeDefined();

    // Test the generated key function
    const key = query.cache!.key!({ id: "123", type: "foo" });
    expect(key).toContain("test.autokey");
    expect(key).toContain("id:123");
    expect(key).toContain("type:foo");
  });

  it("preserves custom cache key function", () => {
    const customKeyFn = (params: { id: string }) => ["custom", params.id];

    const query = defineQuery({
      name: "test.customkey",
      fetch: async () => "data",
      cache: {
        key: customKeyFn,
      },
    });

    expect(query.cache!.key!({ id: "test" })).toEqual(["custom", "test"]);
  });

  it("excludes undefined params from generated key", () => {
    const query = defineQuery({
      name: "test.sparse",
      fetch: async () => "data",
      cache: {},
    });

    const key = query.cache!.key!({ a: "1", b: undefined, c: "3" });
    expect(key).toContain("a:1");
    expect(key).toContain("c:3");
    expect(key.join(",")).not.toContain("b:");
  });

  it("sorts params alphabetically in generated key", () => {
    const query = defineQuery({
      name: "test.sorted",
      fetch: async () => "data",
      cache: {},
    });

    const key = query.cache!.key!({ z: "1", a: "2", m: "3" });
    const keyStr = key.join(",");
    const aPos = keyStr.indexOf("a:");
    const mPos = keyStr.indexOf("m:");
    const zPos = keyStr.indexOf("z:");

    expect(aPos).toBeLessThan(mPos);
    expect(mPos).toBeLessThan(zPos);
  });
});

describe("defineMutation", () => {
  it("returns the mutation definition", () => {
    const mutation = defineMutation<void, { id: string }, void>({
      name: "test.delete",
      execute: async () => {},
    });

    expect(mutation.name).toBe("test.delete");
  });

  it("validates mutation name format", () => {
    expect(() =>
      defineMutation({
        name: "Invalid Name",
        execute: async () => {},
      })
    ).toThrow(/Invalid query name/);
  });

  it("preserves invalidates configuration", () => {
    const targetQuery: Query<string, void> = {
      name: "target.query",
      fetch: async () => "data",
    };

    const mutation = defineMutation({
      name: "test.mutate",
      execute: async () => {},
      invalidates: [targetQuery],
    });

    expect(mutation.invalidates).toHaveLength(1);
    expect(mutation.invalidates?.[0].name).toBe("target.query");
  });
});

describe("createCacheKey", () => {
  it("uses custom key function when provided", () => {
    const query = defineQuery({
      name: "test.custom",
      fetch: async () => "data",
      cache: {
        key: (params: { id: string }) => ["custom", params.id],
      },
    });

    const key = createCacheKey(query, { id: "123" });
    expect(key).toEqual(["custom", "123"]);
  });

  it("returns query name when no cache config", () => {
    const query: Query<string, void> = {
      name: "test.nocache",
      fetch: async () => "data",
    };

    const key = createCacheKey(query, undefined);
    expect(key).toEqual(["test.nocache"]);
  });

  it("returns query name when cache has no key function", () => {
    const query: Query<string, void> = {
      name: "test.nokeyfn",
      fetch: async () => "data",
      cache: { ttl: 5000 },
    };

    const key = createCacheKey(query, undefined);
    expect(key).toEqual(["test.nokeyfn"]);
  });
});

describe("getQueryTTL", () => {
  it("returns cache TTL when defined", () => {
    const query = defineQuery({
      name: "test.ttl",
      fetch: async () => "data",
      cache: { ttl: 30000 },
    });

    expect(getQueryTTL(query)).toBe(30000);
  });

  it("returns default TTL when no cache config", () => {
    const query: Query<string, void> = {
      name: "test.nottl",
      fetch: async () => "data",
    };

    expect(getQueryTTL(query)).toBe(60000);
  });

  it("handles Infinity TTL", () => {
    const query = defineQuery({
      name: "test.infinite",
      fetch: async () => "data",
      cache: { ttl: Infinity },
    });

    expect(getQueryTTL(query)).toBe(Infinity);
  });
});

describe("isQueryStale", () => {
  it("returns false for fresh data", () => {
    const query = defineQuery({
      name: "test.fresh",
      fetch: async () => "data",
      cache: { ttl: 60000 },
    });

    const fetchedAt = Date.now();
    expect(isQueryStale(query, fetchedAt)).toBe(false);
  });

  it("returns true for stale data", () => {
    const query = defineQuery({
      name: "test.stale",
      fetch: async () => "data",
      cache: { ttl: 1000 },
    });

    const fetchedAt = Date.now() - 2000; // 2 seconds ago
    expect(isQueryStale(query, fetchedAt)).toBe(true);
  });

  it("returns false for Infinity TTL", () => {
    const query = defineQuery({
      name: "test.forever",
      fetch: async () => "data",
      cache: { ttl: Infinity },
    });

    const fetchedAt = Date.now() - 1000000; // Very old
    expect(isQueryStale(query, fetchedAt)).toBe(false);
  });

  it("uses default TTL when not specified", () => {
    const query: Query<string, void> = {
      name: "test.default",
      fetch: async () => "data",
    };

    const freshFetchedAt = Date.now();
    const staleFetchedAt = Date.now() - 120000; // 2 minutes ago

    expect(isQueryStale(query, freshFetchedAt)).toBe(false);
    expect(isQueryStale(query, staleFetchedAt)).toBe(true);
  });
});
