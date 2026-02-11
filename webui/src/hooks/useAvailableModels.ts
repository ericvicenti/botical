import { useQuery } from "@tanstack/react-query";

export interface ModelOption {
  id: string;
  name: string;
  providerId: "anthropic" | "anthropic-oauth" | "openai" | "google" | "ollama";
  providerName: string;
  isFree?: boolean;
}

/**
 * Fetch available models from the server.
 * The server uses stored credentials to query each provider.
 */
async function fetchModelsFromServer(): Promise<ModelOption[]> {
  const resp = await fetch("/api/credentials/models");
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.models || []) as ModelOption[];
}

export function useAvailableModels() {
  const query = useQuery({
    queryKey: ["available-models"],
    queryFn: fetchModelsFromServer,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    models: query.data || [],
    isLoading: query.isLoading,
  };
}
