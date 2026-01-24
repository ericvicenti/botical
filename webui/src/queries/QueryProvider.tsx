/**
 * Query Provider
 *
 * Context provider for query dependency injection and testing.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { Query, Mutation, QueryContextValue } from "./types";

const QueryContext = createContext<QueryContextValue>({});

export interface QueryProviderProps {
  children: ReactNode;
  /** Override queries for testing */
  queryOverrides?: Record<string, Query<unknown, unknown>>;
  /** Override mutations for testing */
  mutationOverrides?: Record<string, Mutation<unknown, unknown>>;
}

/**
 * Provider for query context
 */
export function QueryProvider({
  children,
  queryOverrides,
  mutationOverrides,
}: QueryProviderProps) {
  return (
    <QueryContext.Provider value={{ queryOverrides, mutationOverrides }}>
      {children}
    </QueryContext.Provider>
  );
}

/**
 * Hook to access query context
 */
export function useQueryContext(): QueryContextValue {
  return useContext(QueryContext);
}

/**
 * Get a query definition, with override support for testing
 */
export function useQueryDefinition<T, P>(
  query: Query<T, P>
): Query<T, P> {
  const { queryOverrides } = useQueryContext();
  if (queryOverrides && query.name in queryOverrides) {
    return queryOverrides[query.name] as Query<T, P>;
  }
  return query;
}

/**
 * Get a mutation definition, with override support for testing
 */
export function useMutationDefinition<TParams, TResult>(
  mutation: Mutation<TParams, TResult>
): Mutation<TParams, TResult> {
  const { mutationOverrides } = useQueryContext();
  if (mutationOverrides && mutation.name in mutationOverrides) {
    return mutationOverrides[mutation.name] as Mutation<TParams, TResult>;
  }
  return mutation;
}
