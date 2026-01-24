/**
 * useIrisMutation Hook
 *
 * React hook for executing mutations with automatic cache invalidation.
 */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { Mutation, MutationState, UseMutationOptions } from "./types";
import { useMutationDefinition } from "./QueryProvider";

/**
 * Build the API URL for a mutation
 */
function buildMutationUrl<TParams, TResult>(
  mutation: Mutation<TParams, TResult>,
  params: TParams
): string {
  return typeof mutation.endpoint === "function"
    ? mutation.endpoint(params)
    : mutation.endpoint;
}

/**
 * Execute a mutation
 */
async function executeMutation<TParams, TResult>(
  mutation: Mutation<TParams, TResult>,
  params: TParams
): Promise<TResult> {
  const url = buildMutationUrl(mutation, params);
  const method = mutation.method ?? "POST";
  const body = mutation.body ? mutation.body(params) : params;

  return apiClient<TResult>(url, {
    method,
    body: JSON.stringify(body),
  });
}

/**
 * useIrisMutation hook
 *
 * Executes mutations with:
 * - Automatic cache invalidation
 * - Type-safe params and return types
 * - Error handling
 */
export function useIrisMutation<TParams, TResult>(
  mutation: Mutation<TParams, TResult>,
  options: UseMutationOptions<TResult> = {}
): MutationState<TParams, TResult> {
  const resolvedMutation = useMutationDefinition(mutation);
  const queryClient = useQueryClient();

  const result = useMutation({
    mutationFn: (params: TParams) => executeMutation(resolvedMutation, params),
    onSuccess: (data, variables) => {
      // Invalidate queries by name
      if (resolvedMutation.invalidates) {
        for (const queryName of resolvedMutation.invalidates) {
          // Invalidate all queries starting with this name
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey;
              return Array.isArray(key) && key[0] === queryName;
            },
          });
        }
      }

      // Invalidate specific keys
      if (resolvedMutation.invalidateKeys) {
        const keys = resolvedMutation.invalidateKeys(variables, data);
        for (const key of keys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }

      // Call user's onSuccess
      options.onSuccess?.(data);
    },
    onError: (error: Error) => {
      options.onError?.(error);
    },
    onSettled: () => {
      options.onSettled?.();
    },
  });

  const mutate = useCallback(
    (params: TParams) => {
      result.mutate(params);
    },
    [result.mutate]
  );

  const mutateAsync = useCallback(
    async (params: TParams): Promise<TResult> => {
      return result.mutateAsync(params);
    },
    [result.mutateAsync]
  );

  const reset = useCallback(() => {
    result.reset();
  }, [result.reset]);

  return {
    mutate,
    mutateAsync,
    data: result.data,
    isPending: result.isPending,
    isError: result.isError,
    error: result.error,
    isSuccess: result.isSuccess,
    reset,
  };
}
