/**
 * Provider Registry Tests
 */

import { describe, it, expect } from "bun:test";
import { ProviderRegistry } from "@/agents/providers.ts";

describe("Provider Registry", () => {
  describe("getProvider", () => {
    it("returns anthropic provider configuration", () => {
      const provider = ProviderRegistry.getProvider("anthropic");

      expect(provider).toBeDefined();
      expect(provider?.name).toBe("Anthropic");
      expect(provider?.defaultModel).toBe("claude-sonnet-4-20250514");
    });

    it("returns openai provider configuration", () => {
      const provider = ProviderRegistry.getProvider("openai");

      expect(provider).toBeDefined();
      expect(provider?.name).toBe("OpenAI");
      expect(provider?.defaultModel).toBe("gpt-4o");
    });

    it("returns google provider configuration", () => {
      const provider = ProviderRegistry.getProvider("google");

      expect(provider).toBeDefined();
      expect(provider?.name).toBe("Google");
      expect(provider?.defaultModel).toBe("gemini-2.0-flash");
    });

    it("returns null for unknown provider", () => {
      const provider = ProviderRegistry.getProvider(
        "unknown" as "anthropic" | "openai" | "google"
      );
      expect(provider).toBeNull();
    });
  });

  describe("getProviders", () => {
    it("returns all providers", () => {
      const providers = ProviderRegistry.getProviders();

      expect(providers.length).toBe(5);
      expect(providers.map((p) => p.id)).toContain("anthropic");
      expect(providers.map((p) => p.id)).toContain("anthropic-oauth");
      expect(providers.map((p) => p.id)).toContain("openai");
      expect(providers.map((p) => p.id)).toContain("google");
      expect(providers.map((p) => p.id)).toContain("ollama");
    });
  });

  describe("getModel", () => {
    it("returns anthropic model configuration", () => {
      const model = ProviderRegistry.getModel(
        "anthropic",
        "claude-sonnet-4-20250514"
      );

      expect(model).toBeDefined();
      expect(model?.name).toBe("Claude Sonnet 4");
      expect(model?.costPer1kInput).toBeGreaterThan(0);
      expect(model?.costPer1kOutput).toBeGreaterThan(0);
    });

    it("returns openai model configuration", () => {
      const model = ProviderRegistry.getModel("openai", "gpt-4o");

      expect(model).toBeDefined();
      expect(model?.name).toBe("GPT-4o");
    });

    it("returns google model configuration", () => {
      const model = ProviderRegistry.getModel("google", "gemini-2.0-flash");

      expect(model).toBeDefined();
      expect(model?.name).toBe("Gemini 2.0 Flash");
    });

    it("returns null for unknown model", () => {
      const model = ProviderRegistry.getModel("anthropic", "unknown-model");
      expect(model).toBeNull();
    });
  });

  describe("getModels", () => {
    it("returns all models for anthropic", () => {
      const models = ProviderRegistry.getModels("anthropic");

      expect(models.length).toBeGreaterThan(0);
      expect(models.map((m) => m.id)).toContain("claude-sonnet-4-20250514");
      expect(models.map((m) => m.id)).toContain("claude-opus-4-20250514");
      expect(models.map((m) => m.id)).toContain("claude-3-5-haiku-20241022");
    });

    it("returns all models for openai", () => {
      const models = ProviderRegistry.getModels("openai");

      expect(models.length).toBeGreaterThan(0);
      expect(models.map((m) => m.id)).toContain("gpt-4o");
      expect(models.map((m) => m.id)).toContain("gpt-4o-mini");
    });

    it("returns empty array for unknown provider", () => {
      const models = ProviderRegistry.getModels(
        "unknown" as "anthropic" | "openai" | "google"
      );
      expect(models.length).toBe(0);
    });
  });

  describe("calculateCost", () => {
    it("calculates cost for anthropic models", () => {
      const cost = ProviderRegistry.calculateCost(
        "anthropic",
        "claude-sonnet-4-20250514",
        1000, // input tokens
        500 // output tokens
      );

      // Cost should be greater than 0
      expect(cost).toBeGreaterThan(0);
    });

    it("calculates cost for openai models", () => {
      const cost = ProviderRegistry.calculateCost(
        "openai",
        "gpt-4o",
        1000,
        500
      );

      expect(cost).toBeGreaterThan(0);
    });

    it("returns 0 for unknown model", () => {
      const cost = ProviderRegistry.calculateCost(
        "anthropic",
        "unknown-model",
        1000,
        500
      );

      expect(cost).toBe(0);
    });

    it("returns 0 for zero tokens", () => {
      const cost = ProviderRegistry.calculateCost(
        "anthropic",
        "claude-sonnet-4-20250514",
        0,
        0
      );

      expect(cost).toBe(0);
    });

    it("calculates cost proportionally", () => {
      const cost1 = ProviderRegistry.calculateCost(
        "anthropic",
        "claude-sonnet-4-20250514",
        1000,
        500
      );

      const cost2 = ProviderRegistry.calculateCost(
        "anthropic",
        "claude-sonnet-4-20250514",
        2000,
        1000
      );

      // Double tokens should be double cost
      expect(cost2).toBeCloseTo(cost1 * 2, 6);
    });
  });

  describe("createModel", () => {
    it("creates anthropic model instance", () => {
      const model = ProviderRegistry.createModel(
        "anthropic",
        "claude-sonnet-4-20250514",
        "test-api-key"
      );

      expect(model).toBeDefined();
    });

    it("creates openai model instance", () => {
      const model = ProviderRegistry.createModel(
        "openai",
        "gpt-4o",
        "test-api-key"
      );

      expect(model).toBeDefined();
    });

    it("creates google model instance", () => {
      const model = ProviderRegistry.createModel(
        "google",
        "gemini-2.0-flash",
        "test-api-key"
      );

      expect(model).toBeDefined();
    });

    it("uses default model when modelId is null", () => {
      const model = ProviderRegistry.createModel(
        "anthropic",
        null,
        "test-api-key"
      );

      expect(model).toBeDefined();
    });

    it("throws for unknown provider", () => {
      expect(() => {
        ProviderRegistry.createModel(
          "unknown" as "anthropic" | "openai" | "google",
          "model",
          "test-api-key"
        );
      }).toThrow("Unknown provider: unknown");
    });
  });
});
