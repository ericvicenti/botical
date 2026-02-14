/**
 * Credential Resolver
 *
 * Resolves AI provider credentials on demand, handling OAuth token refresh
 * and persistence. Replaces the pattern of passing static apiKey strings
 * through the agent execution chain.
 *
 * Key behaviors:
 * - Lazily resolves credentials from the database
 * - For OAuth providers, automatically refreshes expired tokens
 * - Persists refreshed tokens back to the database
 * - Thread-safe refresh (deduplicates concurrent refresh attempts)
 */

import { ProviderCredentialsService } from "@/services/provider-credentials.ts";
import type { ProviderId } from "./types.ts";

/**
 * A credential resolver that fetches fresh credentials on each call
 */
export class CredentialResolver {
  private userId: string;
  private providerId: ProviderId;
  private staticKey: string | null;
  /** In-flight refresh promise to deduplicate concurrent refreshes */
  private refreshPromise: Promise<string> | null = null;

  /**
   * Create a resolver
   *
   * @param userId - User ID for credential lookup
   * @param providerId - Provider to resolve credentials for
   * @param staticKey - Optional static API key (overrides DB lookup)
   */
  constructor(userId: string, providerId: ProviderId, staticKey?: string) {
    this.userId = userId;
    this.providerId = providerId;
    this.staticKey = staticKey ?? null;
  }

  /**
   * Get the provider ID this resolver is for
   */
  getProviderId(): ProviderId {
    return this.providerId;
  }

  /**
   * Resolve fresh credentials.
   *
   * For regular providers, returns the API key string.
   * For anthropic-oauth, returns JSON with fresh (possibly refreshed) tokens.
   *
   * @throws Error if no credentials found
   */
  resolve(): string {
    // Static key takes priority (e.g., passed in request body)
    if (this.staticKey) {
      return this.maybeRefreshOAuthSync(this.staticKey);
    }

    const apiKey = ProviderCredentialsService.getApiKey(this.userId, this.providerId);
    if (!apiKey) {
      throw new Error(
        `No API key found for provider "${this.providerId}". Please add credentials first.`
      );
    }

    return this.maybeRefreshOAuthSync(apiKey);
  }

  /**
   * Resolve credentials asynchronously (allows OAuth token refresh with persistence)
   */
  async resolveAsync(): Promise<string> {
    const apiKey = this.resolve();

    if (this.providerId !== "anthropic-oauth") {
      return apiKey;
    }

    // For OAuth, always try to refresh if expired
    try {
      const tokens = JSON.parse(apiKey);
      if (Date.now() >= tokens.expires) {
        return this.refreshOAuthTokens(tokens);
      }
      // Even if not "expired" per timestamp, tokens may have been revoked.
      // The oauthFetch wrapper handles 401 retry, so just return here.
      return apiKey;
    } catch {
      return apiKey;
    }
  }

  /**
   * Create a resolver for a sub-agent that inherits the parent's credential source
   * but can override the provider
   */
  forProvider(providerId: ProviderId): CredentialResolver {
    if (providerId === this.providerId) return this;
    // Sub-agents always resolve from DB (no static key inheritance across providers)
    return new CredentialResolver(this.userId, providerId);
  }

  /**
   * Synchronous check — if OAuth tokens are expired, we still return them
   * and let the oauthFetch wrapper handle refresh at request time.
   * This keeps the synchronous `resolve()` path simple.
   */
  private maybeRefreshOAuthSync(apiKey: string): string {
    return apiKey;
  }

  /**
   * Refresh OAuth tokens and persist to DB
   */
  private async refreshOAuthTokens(tokens: {
    access: string;
    refresh: string;
    expires: number;
  }): Promise<string> {
    // Deduplicate concurrent refreshes
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.doRefresh(tokens).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async doRefresh(tokens: {
    access: string;
    refresh: string;
    expires: number;
  }): Promise<string> {
    try {
      const resp = await fetch("https://console.anthropic.com/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh,
          client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        }),
      });

      if (!resp.ok) {
        console.error(`[CredentialResolver] OAuth refresh failed: ${resp.status}`);
        // Return existing tokens — the oauthFetch wrapper will also try
        return JSON.stringify(tokens);
      }

      const data = await resp.json();
      const newTokens = {
        access: data.access_token,
        refresh: data.refresh_token || tokens.refresh,
        expires: Date.now() + (data.expires_in || 3600) * 1000,
      };

      const newApiKey = JSON.stringify(newTokens);

      // Persist refreshed tokens to database
      this.persistRefreshedTokens(newApiKey);

      // Update static key cache if we were using one
      if (this.staticKey) {
        this.staticKey = newApiKey;
      }

      console.log("[CredentialResolver] OAuth tokens refreshed and persisted");
      return newApiKey;
    } catch (err) {
      console.error("[CredentialResolver] OAuth refresh error:", err);
      return JSON.stringify(tokens);
    }
  }

  /**
   * Persist refreshed OAuth tokens back to the database
   */
  private persistRefreshedTokens(newApiKey: string): void {
    try {
      // Find the credential and update it
      const credentials = ProviderCredentialsService.list(this.userId);
      const oauthCred = credentials.find(
        (c) => c.provider === "anthropic-oauth" && c.isDefault
      );

      if (oauthCred) {
        ProviderCredentialsService.update(this.userId, oauthCred.id, {
          apiKey: newApiKey,
        });
      }
    } catch (err) {
      console.error("[CredentialResolver] Failed to persist refreshed tokens:", err);
    }
  }
}
