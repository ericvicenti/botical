import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/lib/api/queries";

export interface ModelOption {
  id: string;
  name: string;
  providerId: "anthropic" | "openai" | "google" | "ollama";
  providerName: string;
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelOption[]> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models = (data.data || []) as Array<{ id: string; display_name?: string }>;
    return models
      .filter((m) => m.id.includes("claude"))
      .map((m) => ({
        id: m.id,
        name: m.display_name || m.id,
        providerId: "anthropic" as const,
        providerName: "Anthropic",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelOption[]> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models = (data.data || []) as Array<{ id: string }>;
    return models
      .filter((m) => /^(gpt-|o1|o3|chatgpt)/.test(m.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        providerId: "openai" as const,
        providerName: "OpenAI",
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

async function fetchGoogleModels(apiKey: string): Promise<ModelOption[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const models = (data.models || []) as Array<{
      name: string;
      displayName: string;
      supportedGenerationMethods?: string[];
    }>;
    return models
      .filter(
        (m) =>
          m.name.includes("gemini") &&
          m.supportedGenerationMethods?.includes("generateContent")
      )
      .map((m) => ({
        id: m.name.replace("models/", ""),
        name: m.displayName || m.name,
        providerId: "google" as const,
        providerName: "Google",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function fetchOllamaModels(baseUrl: string): Promise<ModelOption[]> {
  try {
    const url = baseUrl.replace(/\/+$/, "");
    const res = await fetch(`${url}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    const models = (data.models || []) as Array<{ name: string }>;
    return models.map((m) => ({
      id: m.name,
      name: m.name,
      providerId: "ollama" as const,
      providerName: "Ollama",
    }));
  } catch {
    return [];
  }
}

async function fetchAllModels(settings: {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  ollamaBaseUrl?: string;
}): Promise<ModelOption[]> {
  const promises: Promise<ModelOption[]>[] = [];
  if (settings.anthropicApiKey) promises.push(fetchAnthropicModels(settings.anthropicApiKey));
  if (settings.openaiApiKey) promises.push(fetchOpenAIModels(settings.openaiApiKey));
  if (settings.googleApiKey) promises.push(fetchGoogleModels(settings.googleApiKey));
  if (settings.ollamaBaseUrl) promises.push(fetchOllamaModels(settings.ollamaBaseUrl));

  if (promises.length === 0) return [];
  const results = await Promise.all(promises);
  return results.flat();
}

export function useAvailableModels() {
  const { data: settings } = useSettings();

  const keyFingerprint = settings
    ? [
        settings.anthropicApiKey ? "a" : "",
        settings.openaiApiKey ? "o" : "",
        settings.googleApiKey ? "g" : "",
        settings.ollamaBaseUrl ? "l" : "",
      ].join("")
    : "";

  const query = useQuery({
    queryKey: ["available-models", keyFingerprint],
    queryFn: () => fetchAllModels(settings!),
    enabled: !!settings && keyFingerprint.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    models: query.data || [],
    isLoading: query.isLoading,
  };
}
