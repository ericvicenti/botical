/**
 * AI Provider Registry
 *
 * Manages AI provider configurations and model information.
 * Integrates with Vercel AI SDK for unified provider access.
 * See: docs/knowledge-base/04-patterns.md
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";
import type { ProviderConfig, ProviderId, ModelConfig } from "./types.ts";

/**
 * Model configurations for each provider
 */
const ANTHROPIC_MODELS: ModelConfig[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
  },
];

const OPENAI_MODELS: ModelConfig[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  {
    id: "o1",
    name: "o1",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsTools: false,
    supportsStreaming: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.06,
  },
];

const GOOGLE_MODELS: ModelConfig[] = [
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.0,
    costPer1kOutput: 0.0,
  },
  {
    id: "gemini-2.0-flash-thinking-exp",
    name: "Gemini 2.0 Flash Thinking",
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.0,
    costPer1kOutput: 0.0,
  },
];

const OLLAMA_MODELS: ModelConfig[] = [
  {
    id: "llama3.1",
    name: "Llama 3.1",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.0,
    costPer1kOutput: 0.0,
  },
  {
    id: "llama3.2",
    name: "Llama 3.2",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.0,
    costPer1kOutput: 0.0,
  },
  {
    id: "mistral",
    name: "Mistral",
    contextWindow: 32000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.0,
    costPer1kOutput: 0.0,
  },
];

/**
 * Provider configurations
 */
const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    defaultModel: "claude-sonnet-4-20250514",
    models: ANTHROPIC_MODELS,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4o",
    models: OPENAI_MODELS,
  },
  google: {
    id: "google",
    name: "Google",
    defaultModel: "gemini-2.0-flash",
    models: GOOGLE_MODELS,
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    defaultModel: "llama3.1",
    models: OLLAMA_MODELS,
  },
};

/**
 * Provider Registry for managing AI providers and models
 */
export class ProviderRegistry {
  /**
   * Get all available providers
   */
  static getProviders(): ProviderConfig[] {
    return Object.values(PROVIDERS);
  }

  /**
   * Get a specific provider configuration
   */
  static getProvider(providerId: ProviderId): ProviderConfig | null {
    return PROVIDERS[providerId] ?? null;
  }

  /**
   * Get a specific model configuration
   */
  static getModel(
    providerId: ProviderId,
    modelId: string
  ): ModelConfig | null {
    const provider = PROVIDERS[providerId];
    if (!provider) return null;

    return provider.models.find((m) => m.id === modelId) ?? null;
  }

  /**
   * Get the default model for a provider
   */
  static getDefaultModel(providerId: ProviderId): ModelConfig | null {
    const provider = PROVIDERS[providerId];
    if (!provider) return null;

    return provider.models.find((m) => m.id === provider.defaultModel) ?? null;
  }

  /**
   * Get all models for a provider
   */
  static getModels(providerId: ProviderId): ModelConfig[] {
    const provider = PROVIDERS[providerId];
    return provider?.models ?? [];
  }

  /**
   * Create a Vercel AI SDK language model instance
   *
   * @param providerId - The provider ID
   * @param modelId - The model ID (uses provider default if not specified)
   * @param credentials - The credentials for the provider (API key or base URL)
   * @returns A configured LanguageModel instance
   */
  static createModel(
    providerId: ProviderId,
    modelId: string | null,
    credentials: string
  ): LanguageModel {
    const provider = PROVIDERS[providerId];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const effectiveModelId = modelId ?? provider.defaultModel;
    const modelConfig = provider.models.find((m) => m.id === effectiveModelId);
    // Allow any model ID — the provider SDK will validate it
    if (!modelConfig) {
      console.warn(
        `Model ${effectiveModelId} not in known list for ${providerId}, passing through to provider SDK`
      );
    }

    switch (providerId) {
      case "anthropic": {
        const anthropic = createAnthropic({ apiKey: credentials });
        return anthropic(effectiveModelId);
      }
      case "openai": {
        const openai = createOpenAI({ apiKey: credentials });
        return openai(effectiveModelId);
      }
      case "google": {
        const google = createGoogleGenerativeAI({ apiKey: credentials });
        return google(effectiveModelId);
      }
      case "ollama": {
        const ollama = createOllama({ baseURL: credentials });
        return ollama(effectiveModelId);
      }
      default:
        throw new Error(`Unsupported provider: ${providerId}`);
    }
  }

  /**
   * Calculate estimated cost for token usage
   */
  static calculateCost(
    providerId: ProviderId,
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const model = this.getModel(providerId, modelId);
    if (!model) return 0;

    const inputCost = (inputTokens / 1000) * model.costPer1kInput;
    const outputCost = (outputTokens / 1000) * model.costPer1kOutput;

    return inputCost + outputCost;
  }

  /**
   * Check if a provider is available (has valid configuration)
   */
  static isProviderAvailable(providerId: ProviderId): boolean {
    return providerId in PROVIDERS;
  }

  /**
   * Validate provider and model combination
   */
  static validateProviderModel(
    providerId: ProviderId,
    modelId?: string | null
  ): { valid: boolean; error?: string } {
    const provider = PROVIDERS[providerId];
    if (!provider) {
      return { valid: false, error: `Unknown provider: ${providerId}` };
    }

    if (modelId) {
      const model = provider.models.find((m) => m.id === modelId);
      if (!model) {
        return {
          valid: false,
          error: `Unknown model ${modelId} for provider ${providerId}`,
        };
      }
    }

    return { valid: true };
  }
}
