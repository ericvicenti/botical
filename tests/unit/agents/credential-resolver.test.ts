/**
 * CredentialResolver Tests
 */

import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { CredentialResolver } from "@/agents/credential-resolver.ts";
import * as ProviderCredentialsModule from "@/services/provider-credentials.ts";

describe("CredentialResolver", () => {
  let getApiKeySpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getApiKeySpy = spyOn(
      ProviderCredentialsModule.ProviderCredentialsService,
      "getApiKey"
    );
  });

  afterEach(() => {
    getApiKeySpy.mockRestore();
  });

  describe("resolve", () => {
    it("returns static key when provided", () => {
      const resolver = new CredentialResolver("user1", "anthropic", "sk-static");
      expect(resolver.resolve()).toBe("sk-static");
      // Should NOT hit the DB
      expect(getApiKeySpy).not.toHaveBeenCalled();
    });

    it("falls back to DB when no static key", () => {
      getApiKeySpy.mockReturnValue("sk-from-db");
      const resolver = new CredentialResolver("user1", "anthropic");
      expect(resolver.resolve()).toBe("sk-from-db");
      expect(getApiKeySpy).toHaveBeenCalledWith("user1", "anthropic");
    });

    it("throws when no credentials found", () => {
      getApiKeySpy.mockReturnValue(null);
      const resolver = new CredentialResolver("user1", "openai");
      expect(() => resolver.resolve()).toThrow("No API key found");
    });

    it("resolves fresh credentials each call from DB", () => {
      getApiKeySpy
        .mockReturnValueOnce("key-v1")
        .mockReturnValueOnce("key-v2");
      const resolver = new CredentialResolver("user1", "anthropic");
      expect(resolver.resolve()).toBe("key-v1");
      expect(resolver.resolve()).toBe("key-v2");
    });
  });

  describe("forProvider", () => {
    it("returns self when same provider", () => {
      const resolver = new CredentialResolver("user1", "anthropic", "sk-test");
      expect(resolver.forProvider("anthropic")).toBe(resolver);
    });

    it("returns new resolver for different provider", () => {
      const resolver = new CredentialResolver("user1", "anthropic", "sk-test");
      const openaiResolver = resolver.forProvider("openai");
      expect(openaiResolver).not.toBe(resolver);
      expect(openaiResolver.getProviderId()).toBe("openai");
    });

    it("new resolver resolves from DB (no static key inheritance)", () => {
      getApiKeySpy.mockReturnValue("openai-key");
      const resolver = new CredentialResolver("user1", "anthropic", "sk-anthropic");
      const openaiResolver = resolver.forProvider("openai");
      expect(openaiResolver.resolve()).toBe("openai-key");
      expect(getApiKeySpy).toHaveBeenCalledWith("user1", "openai");
    });
  });

  describe("getProviderId", () => {
    it("returns the provider ID", () => {
      const resolver = new CredentialResolver("user1", "google");
      expect(resolver.getProviderId()).toBe("google");
    });
  });

  describe("OAuth token handling", () => {
    it("returns OAuth JSON credentials as-is synchronously", () => {
      const tokens = JSON.stringify({
        access: "acc-123",
        refresh: "ref-456",
        expires: Date.now() + 3600000,
      });
      const resolver = new CredentialResolver("user1", "anthropic-oauth", tokens);
      const result = resolver.resolve();
      expect(JSON.parse(result)).toHaveProperty("access", "acc-123");
    });
  });
});
