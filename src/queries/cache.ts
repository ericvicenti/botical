/**
 * Query Cache Implementation
 *
 * In-memory cache with TTL support for backend query results.
 */

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  ttl: number;
}

/**
 * Query Cache
 *
 * Simple in-memory cache with TTL support.
 * Thread-safe for single-process deployments.
 */
export class QueryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs: number = 60_000) {
    // Periodically clean up expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  /**
   * Convert array key to string
   */
  private keyToString(key: string[]): string {
    return key.join(":");
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string[]): CacheEntry<T> | undefined {
    const keyStr = this.keyToString(key);
    const entry = this.cache.get(keyStr) as CacheEntry<T> | undefined; // Safe: Map stores CacheEntry<T> values

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(keyStr);
      return undefined;
    }

    return entry;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string[], data: T, ttl: number): void {
    const keyStr = this.keyToString(key);
    this.cache.set(keyStr, {
      data,
      fetchedAt: Date.now(),
      ttl,
    });
  }

  /**
   * Delete a value from cache
   */
  delete(key: string[]): boolean {
    return this.cache.delete(this.keyToString(key));
  }

  /**
   * Invalidate all entries matching a prefix
   */
  invalidatePrefix(prefix: string[]): number {
    const prefixStr = this.keyToString(prefix);
    let count = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefixStr)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Check if an entry has expired
   */
  isExpired<T>(entry: CacheEntry<T>): boolean {
    if (entry.ttl === Infinity) {
      return false;
    }
    return Date.now() - entry.fetchedAt > entry.ttl;
  }

  /**
   * Check if a cached entry is stale (should be refreshed)
   */
  isStale<T>(entry: CacheEntry<T>): boolean {
    return this.isExpired(entry);
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    let count = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttl !== Infinity && now - entry.fetchedAt > entry.ttl) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in cache
   */
  keys(): string[][] {
    return Array.from(this.cache.keys()).map((k) => k.split(":"));
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

/**
 * Global cache instance for the backend
 */
let globalCache: QueryCache | null = null;

/**
 * Get the global cache instance
 */
export function getGlobalCache(): QueryCache {
  if (!globalCache) {
    globalCache = new QueryCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing)
 */
export function resetGlobalCache(): void {
  if (globalCache) {
    globalCache.destroy();
    globalCache = null;
  }
}
