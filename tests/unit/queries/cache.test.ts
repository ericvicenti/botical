/**
 * QueryCache Unit Tests
 *
 * Tests for the in-memory cache implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  QueryCache,
  getGlobalCache,
  resetGlobalCache,
  type CacheEntry,
} from "@/queries/cache.ts";

describe("QueryCache", () => {
  let cache: QueryCache;

  beforeEach(() => {
    // Use a very long cleanup interval for tests
    cache = new QueryCache(1000000);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe("set and get", () => {
    it("stores and retrieves values", () => {
      cache.set(["test", "key"], "value", 60000);
      const entry = cache.get<string>(["test", "key"]);

      expect(entry).toBeDefined();
      expect(entry!.data).toBe("value");
    });

    it("returns undefined for missing keys", () => {
      const entry = cache.get(["nonexistent"]);
      expect(entry).toBeUndefined();
    });

    it("stores complex objects", () => {
      const data = { id: 1, name: "test", nested: { value: true } };
      cache.set(["complex"], data, 60000);

      const entry = cache.get<typeof data>(["complex"]);
      expect(entry!.data).toEqual(data);
    });

    it("handles array keys correctly", () => {
      cache.set(["a", "b", "c"], "value1", 60000);
      cache.set(["a", "b"], "value2", 60000);
      cache.set(["a"], "value3", 60000);

      expect(cache.get<string>(["a", "b", "c"])!.data).toBe("value1");
      expect(cache.get<string>(["a", "b"])!.data).toBe("value2");
      expect(cache.get<string>(["a"])!.data).toBe("value3");
    });

    it("overwrites existing entries", () => {
      cache.set(["key"], "old", 60000);
      cache.set(["key"], "new", 60000);

      expect(cache.get<string>(["key"])!.data).toBe("new");
    });

    it("records fetchedAt timestamp", () => {
      const before = Date.now();
      cache.set(["timed"], "data", 60000);
      const after = Date.now();

      const entry = cache.get(["timed"]);
      expect(entry!.fetchedAt).toBeGreaterThanOrEqual(before);
      expect(entry!.fetchedAt).toBeLessThanOrEqual(after);
    });
  });

  describe("expiration", () => {
    it("returns undefined for expired entries", async () => {
      cache.set(["expire"], "data", 10); // 10ms TTL

      // Wait for expiration
      await new Promise((r) => setTimeout(r, 20));

      const entry = cache.get(["expire"]);
      expect(entry).toBeUndefined();
    });

    it("returns entry for non-expired data", async () => {
      cache.set(["fresh"], "data", 60000);

      await new Promise((r) => setTimeout(r, 10));

      const entry = cache.get(["fresh"]);
      expect(entry).toBeDefined();
      expect(entry!.data).toBe("data");
    });

    it("never expires Infinity TTL", async () => {
      cache.set(["forever"], "data", Infinity);

      // Simulate passage of time by checking isExpired directly
      const entry = cache.get<string>(["forever"]);
      expect(cache.isExpired(entry!)).toBe(false);
    });
  });

  describe("isExpired", () => {
    it("returns true for expired entries", () => {
      const entry: CacheEntry<string> = {
        data: "test",
        fetchedAt: Date.now() - 10000,
        ttl: 5000,
      };

      expect(cache.isExpired(entry)).toBe(true);
    });

    it("returns false for fresh entries", () => {
      const entry: CacheEntry<string> = {
        data: "test",
        fetchedAt: Date.now(),
        ttl: 60000,
      };

      expect(cache.isExpired(entry)).toBe(false);
    });

    it("returns false for Infinity TTL", () => {
      const entry: CacheEntry<string> = {
        data: "test",
        fetchedAt: Date.now() - 1000000000,
        ttl: Infinity,
      };

      expect(cache.isExpired(entry)).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes entries", () => {
      cache.set(["to-delete"], "data", 60000);
      expect(cache.get(["to-delete"])).toBeDefined();

      const deleted = cache.delete(["to-delete"]);
      expect(deleted).toBe(true);
      expect(cache.get(["to-delete"])).toBeUndefined();
    });

    it("returns false for non-existent keys", () => {
      const deleted = cache.delete(["nonexistent"]);
      expect(deleted).toBe(false);
    });
  });

  describe("invalidatePrefix", () => {
    it("removes all entries matching prefix", () => {
      cache.set(["users", "1"], "user1", 60000);
      cache.set(["users", "2"], "user2", 60000);
      cache.set(["users", "3"], "user3", 60000);
      cache.set(["projects", "1"], "project1", 60000);

      const count = cache.invalidatePrefix(["users"]);

      expect(count).toBe(3);
      expect(cache.get(["users", "1"])).toBeUndefined();
      expect(cache.get(["users", "2"])).toBeUndefined();
      expect(cache.get(["users", "3"])).toBeUndefined();
      expect(cache.get(["projects", "1"])).toBeDefined();
    });

    it("handles nested prefixes", () => {
      cache.set(["a", "b", "c"], "1", 60000);
      cache.set(["a", "b", "d"], "2", 60000);
      cache.set(["a", "x", "y"], "3", 60000);

      const count = cache.invalidatePrefix(["a", "b"]);

      expect(count).toBe(2);
      expect(cache.get(["a", "x", "y"])).toBeDefined();
    });

    it("returns 0 when no matches", () => {
      cache.set(["keep"], "data", 60000);

      const count = cache.invalidatePrefix(["nonexistent"]);
      expect(count).toBe(0);
      expect(cache.get(["keep"])).toBeDefined();
    });
  });

  describe("cleanup", () => {
    it("removes expired entries", async () => {
      cache.set(["expire1"], "data", 10);
      cache.set(["expire2"], "data", 10);
      cache.set(["keep"], "data", 60000);

      await new Promise((r) => setTimeout(r, 20));

      const count = cache.cleanup();

      expect(count).toBe(2);
      expect(cache.get(["keep"])).toBeDefined();
    });

    it("preserves Infinity TTL entries", () => {
      cache.set(["forever"], "data", Infinity);

      const count = cache.cleanup();

      expect(count).toBe(0);
      expect(cache.get(["forever"])).toBeDefined();
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set(["a"], "1", 60000);
      cache.set(["b"], "2", 60000);
      cache.set(["c"], "3", 60000);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get(["a"])).toBeUndefined();
    });
  });

  describe("size", () => {
    it("returns the number of entries", () => {
      expect(cache.size()).toBe(0);

      cache.set(["a"], "1", 60000);
      expect(cache.size()).toBe(1);

      cache.set(["b"], "2", 60000);
      expect(cache.size()).toBe(2);

      cache.delete(["a"]);
      expect(cache.size()).toBe(1);
    });
  });

  describe("keys", () => {
    it("returns all cache keys", () => {
      cache.set(["users", "1"], "data", 60000);
      cache.set(["projects", "2"], "data", 60000);

      const keys = cache.keys();

      expect(keys).toHaveLength(2);
      expect(keys).toContainEqual(["users", "1"]);
      expect(keys).toContainEqual(["projects", "2"]);
    });

    it("returns empty array for empty cache", () => {
      expect(cache.keys()).toEqual([]);
    });
  });

  describe("destroy", () => {
    it("clears cache and stops cleanup interval", () => {
      cache.set(["test"], "data", 60000);
      cache.destroy();

      expect(cache.size()).toBe(0);
    });
  });
});

describe("Global cache", () => {
  afterEach(() => {
    resetGlobalCache();
  });

  it("returns singleton instance", () => {
    const cache1 = getGlobalCache();
    const cache2 = getGlobalCache();

    expect(cache1).toBe(cache2);
  });

  it("can be reset", () => {
    const cache1 = getGlobalCache();
    cache1.set(["test"], "data", 60000);

    resetGlobalCache();

    const cache2 = getGlobalCache();
    expect(cache2).not.toBe(cache1);
    expect(cache2.get(["test"])).toBeUndefined();
  });
});
