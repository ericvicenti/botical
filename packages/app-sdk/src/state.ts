/**
 * @iris/app-sdk - State Primitives
 *
 * Reactive state management for Iris Apps.
 * These primitives track state and trigger UI updates when changed.
 */

import type { StateHandle } from "../../../src/apps/types.ts";

type Listener<T> = (value: T) => void;

/**
 * Create a reactive state value
 *
 * @example
 * ```typescript
 * const count = state(0);
 * count.get();        // 0
 * count.set(5);       // value is now 5
 * count.update(n => n + 1);  // value is now 6
 * ```
 */
export function state<T>(initial: T): StateHandle<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => value,

    set: (newValue: T) => {
      if (Object.is(value, newValue)) return; // Skip if unchanged
      value = newValue;
      listeners.forEach((l) => l(value));
    },

    update: (updater: (prev: T) => T) => {
      const newValue = updater(value);
      if (Object.is(value, newValue)) return;
      value = newValue;
      listeners.forEach((l) => l(value));
    },

    subscribe: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    toJSON: () => value,
  };
}

/**
 * Create a computed value derived from other state
 *
 * @example
 * ```typescript
 * const count = state(5);
 * const doubled = computed(() => count.get() * 2);
 * doubled.get(); // 10
 * ```
 */
export function computed<T>(
  compute: () => T,
  deps: Array<StateHandle<unknown>>
): StateHandle<T> {
  let cachedValue = compute();
  const listeners = new Set<Listener<T>>();

  // Subscribe to dependencies
  const unsubscribers = deps.map((dep) =>
    dep.subscribe(() => {
      const newValue = compute();
      if (Object.is(cachedValue, newValue)) return;
      cachedValue = newValue;
      listeners.forEach((l) => l(cachedValue));
    })
  );

  return {
    get: () => cachedValue,

    set: () => {
      throw new Error("Cannot set a computed value");
    },

    update: () => {
      throw new Error("Cannot update a computed value");
    },

    subscribe: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    toJSON: () => cachedValue,
  };
}

/**
 * Create an async query state
 *
 * @example
 * ```typescript
 * const users = query(async () => {
 *   const response = await fetch('/api/users');
 *   return response.json();
 * });
 *
 * // In UI:
 * users.loading ? Spinner() : UserList({ data: users.data })
 * ```
 */
export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function query<T>(
  fetcher: () => Promise<T>,
  options: { autoFetch?: boolean } = {}
): StateHandle<QueryState<T>> {
  const { autoFetch = true } = options;

  const queryState: QueryState<T> = {
    data: null,
    loading: autoFetch,
    error: null,
    refetch: async () => {
      handle.update((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fetcher();
        handle.update((s) => ({ ...s, data, loading: false }));
      } catch (error) {
        handle.update((s) => ({
          ...s,
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        }));
      }
    },
  };

  const handle = state(queryState);

  // Auto-fetch on creation
  if (autoFetch) {
    queryState.refetch();
  }

  return handle;
}

/**
 * Create a list state with helper methods
 *
 * @example
 * ```typescript
 * const items = list<Todo>([]);
 * items.push({ id: 1, text: 'Hello' });
 * items.remove(item => item.id === 1);
 * ```
 */
export interface ListState<T> extends StateHandle<T[]> {
  push: (item: T) => void;
  remove: (predicate: (item: T) => boolean) => void;
  updateItem: (predicate: (item: T) => boolean, updater: (item: T) => T) => void;
  clear: () => void;
}

export function list<T>(initial: T[] = []): ListState<T> {
  const handle = state<T[]>(initial);

  return {
    ...handle,

    push: (item: T) => {
      handle.update((items) => [...items, item]);
    },

    remove: (predicate: (item: T) => boolean) => {
      handle.update((items) => items.filter((item) => !predicate(item)));
    },

    updateItem: (predicate: (item: T) => boolean, updater: (item: T) => T) => {
      handle.update((items) =>
        items.map((item) => (predicate(item) ? updater(item) : item))
      );
    },

    clear: () => {
      handle.set([]);
    },
  };
}
