/**
 * Provider Credentials Routes
 *
 * Manages user's AI provider API keys.
 * See: docs/knowledge-base/03-api-reference.md
 *
 * Endpoints:
 * - GET    /credentials         - List all credentials
 * - POST   /credentials         - Create/upsert a credential
 * - GET    /credentials/:id     - Get credential details
 * - PATCH  /credentials/:id     - Update credential
 * - DELETE /credentials/:id     - Delete credential
 * - POST   /credentials/:id/default - Set as default
 * - GET    /credentials/check   - Check which providers are configured
 * - GET    /credentials/models  - Fetch available models for all configured providers
 * - POST   /credentials/health  - Check health of a provider credential
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../../auth/index.ts";
import {
  ProviderCredentialsService,
  ProviderCredentialCreateSchema,
  ProviderCredentialUpdateSchema,
  SUPPORTED_PROVIDERS,
  type Provider,
} from "../../services/provider-credentials.ts";
import { ValidationError } from "../../utils/errors.ts";

// Schema for external API responses to replace unsafe type assertions
const AnthropicOAuthModelsResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    display_name: z.string().optional()
  })).optional()
});

const AnthropicOAuthTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional()
});

const OpenAIModelsResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string()
  })).optional()
});

const GoogleModelsResponseSchema = z.object({
  models: z.array(z.object({
    name: z.string(),
    displayName: z.string(),
    supportedGenerationMethods: z.array(z.string()).optional()
  })).optional()
});

const OllamaModelsResponseSchema = z.object({
  models: z.array(z.object({
    name: z.string()
  })).optional()
});

const credentials = new Hono();

// All routes require authentication
credentials.use("*", requireAuth());

/**
 * List all credentials for the current user
 *
 * GET /credentials
 */
credentials.get("/", async (c) => {
  const auth = c.get("auth");
  const creds = ProviderCredentialsService.list(auth.userId);

  return c.json({ credentials: creds });
});

/**
 * Check which providers are configured
 *
 * GET /credentials/check
 */
credentials.get("/check", async (c) => {
  const auth = c.get("auth");
  const configured = ProviderCredentialsService.hasCredentials(auth.userId);

  return c.json({ configured });
});

/**
 * Fetch available models for all configured providers (server-side)
 *
 * GET /credentials/models
 */
credentials.get("/models", async (c) => {
  const auth = c.get("auth");
  const models: Array<{
    id: string;
    name: string;
    providerId: string;
    providerName: string;
    isFree?: boolean;
  }> = [];

  const configured = ProviderCredentialsService.hasCredentials(auth.userId);

  const fetchers: Promise<void>[] = [];

  if (configured.anthropic) {
    const apiKey = ProviderCredentialsService.getApiKey(auth.userId, "anthropic");
    if (apiKey) {
      fetchers.push(
        fetchAnthropicModels(apiKey).then((m) => { models.push(...m); })
      );
    }
  }

  if (configured["anthropic-oauth"]) {
    const tokenJson = ProviderCredentialsService.getApiKey(auth.userId, "anthropic-oauth");
    if (tokenJson) {
      try {
        const tokens = JSON.parse(tokenJson);
        fetchers.push(
          fetchAnthropicOAuthModels(tokens, auth.userId).then((m) => { models.push(...m); })
        );
      } catch { /* ignore bad JSON */ }
    }
  }

  if (configured.openai) {
    const apiKey = ProviderCredentialsService.getApiKey(auth.userId, "openai");
    if (apiKey) {
      fetchers.push(
        fetchOpenAIModels(apiKey).then((m) => { models.push(...m); })
      );
    }
  }

  if (configured.google) {
    const apiKey = ProviderCredentialsService.getApiKey(auth.userId, "google");
    if (apiKey) {
      fetchers.push(
        fetchGoogleModels(apiKey).then((m) => { models.push(...m); })
      );
    }
  }

  if (configured.ollama) {
    const baseUrl = ProviderCredentialsService.getApiKey(auth.userId, "ollama");
    if (baseUrl) {
      fetchers.push(
        fetchOllamaModels(baseUrl).then((m) => { models.push(...m); })
      );
    }
  }

  await Promise.allSettled(fetchers);

  return c.json({ models });
});

/**
 * Check health of a specific provider
 *
 * POST /credentials/health
 * Body: { provider: string }
 */
credentials.post("/health", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json();
  if (!SUPPORTED_PROVIDERS.includes(body.provider)) {
    throw new ValidationError(`Unsupported provider: ${body.provider}`);
  }
  
  // Safe: validated above that body.provider is in SUPPORTED_PROVIDERS
  const provider = body.provider;

  const apiKey = ProviderCredentialsService.getApiKey(auth.userId, provider);
  if (!apiKey) {
    return c.json({ status: "no_key", message: "No credential configured" });
  }

  try {
    if (provider === "ollama") {
      const url = apiKey.replace(/\/+$/, "");
      const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const rawData = await resp.json();
        // Type guard for models response
        const hasModels = (obj: unknown): obj is { models?: unknown[] } => {
          return typeof obj === "object" && obj !== null && "models" in obj;
        };
        
        const data = hasModels(rawData) ? rawData : { models: [] };
        const modelCount = data.models?.length || 0;
        return c.json({ status: "ok", message: `Connected — ${modelCount} model${modelCount !== 1 ? "s" : ""} available` });
      }
      return c.json({ status: "error", message: `HTTP ${resp.status}` });
    }

    if (provider === "anthropic-oauth") {
      try {
        const tokens = JSON.parse(apiKey);
        let current = await refreshAnthropicOAuthTokens(tokens, auth.userId);
        let resp = await fetch("https://api.anthropic.com/v1/models?beta=true&limit=1", {
          headers: {
            "Authorization": `Bearer ${current.access}`,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "oauth-2025-04-20",
          },
          signal: AbortSignal.timeout(10000),
        });
        // If 401, force refresh regardless of expires timestamp
        if (resp.status === 401) {
          current.expires = 0; // Force refresh
          current = await refreshAnthropicOAuthTokens(current, auth.userId);
          resp = await fetch("https://api.anthropic.com/v1/models?beta=true&limit=1", {
            headers: {
              "Authorization": `Bearer ${current.access}`,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": "oauth-2025-04-20",
            },
            signal: AbortSignal.timeout(10000),
          });
        }
        if (resp.ok) return c.json({ status: "ok", message: "OAuth tokens valid" });
        return c.json({ status: "error", message: `OAuth token expired — please reconnect (HTTP ${resp.status})` });
      } catch {
        return c.json({ status: "error", message: "Invalid OAuth token data" });
      }
    }

    // API key-based providers
    let testUrl = "";
    let testHeaders: Record<string, string> = {};

    if (provider === "anthropic") {
      testUrl = "https://api.anthropic.com/v1/models?limit=1";
      testHeaders = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    } else if (provider === "openai") {
      testUrl = "https://api.openai.com/v1/models?limit=1";
      testHeaders = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === "google") {
      testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`;
    }

    const resp = await fetch(testUrl, { headers: testHeaders, signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      return c.json({ status: "ok", message: "API key is valid" });
    }

    let msg = `HTTP ${resp.status}`;
    try {
      const respBody = await resp.text();
      const j = JSON.parse(respBody);
      msg = j.error?.message || j.error?.type || msg;
    } catch { /* ignore */ }

    return c.json({ status: "error", message: msg });
  } catch (err) {
    const message = err instanceof Error
      ? err.name === "TimeoutError" ? "Connection timed out" : err.message
      : "Connection failed";
    return c.json({ status: "error", message });
  }
});

/**
 * Create a new credential (or upsert by provider)
 *
 * POST /credentials
 * Body: { provider, apiKey, name?, isDefault? }
 */
credentials.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json();

  const result = ProviderCredentialCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid credential data"
    );
  }

  // Upsert: if a default credential exists for this provider, update it
  const existing = ProviderCredentialsService.list(auth.userId)
    .find(c => c.provider === result.data.provider && c.isDefault);

  if (existing) {
    const credential = ProviderCredentialsService.update(auth.userId, existing.id, {
      apiKey: result.data.apiKey,
      name: result.data.name,
    });
    return c.json({ credential });
  }

  const credential = ProviderCredentialsService.create(auth.userId, result.data);

  return c.json({ credential }, 201);
});

/**
 * Get credential details
 *
 * GET /credentials/:id
 */
credentials.get("/:id", async (c) => {
  const auth = c.get("auth");
  const credentialId = c.req.param("id");

  const credential = ProviderCredentialsService.getById(auth.userId, credentialId);
  if (!credential) {
    return c.json({ error: "Credential not found" }, 404);
  }

  return c.json({ credential });
});

/**
 * Update a credential
 *
 * PATCH /credentials/:id
 * Body: { apiKey?, name?, isDefault? }
 */
credentials.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const credentialId = c.req.param("id");
  const body = await c.req.json();

  const result = ProviderCredentialUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid update data"
    );
  }

  const credential = ProviderCredentialsService.update(
    auth.userId,
    credentialId,
    result.data
  );

  return c.json({ credential });
});

/**
 * Delete a credential
 *
 * DELETE /credentials/:id
 */
credentials.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const credentialId = c.req.param("id");

  ProviderCredentialsService.delete(auth.userId, credentialId);

  return c.json({ success: true });
});

/**
 * Set credential as default for its provider
 *
 * POST /credentials/:id/default
 */
credentials.post("/:id/default", async (c) => {
  const auth = c.get("auth");
  const credentialId = c.req.param("id");

  ProviderCredentialsService.setDefault(auth.userId, credentialId);

  return c.json({ success: true });
});

// ---- Model fetching helpers ----

interface ModelOption {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  isFree?: boolean;
}

const PREFERRED_ANTHROPIC = [
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
  "claude-3-5-haiku-20241022",
];

async function fetchAnthropicModels(apiKey: string): Promise<ModelOption[]> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const rawData = await res.json();
    const data = AnthropicOAuthModelsResponseSchema.parse(rawData);
    return (data.data || [])
      .filter((m) => m.id.includes("claude"))
      .map((m) => ({ id: m.id, name: m.display_name || m.id, providerId: "anthropic", providerName: "Anthropic" }))
      .sort((a, b) => {
        const aIdx = PREFERRED_ANTHROPIC.indexOf(a.id);
        const bIdx = PREFERRED_ANTHROPIC.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch { return []; }
}

async function refreshAnthropicOAuthTokens(
  tokens: { access: string; refresh: string; expires: number },
  userId: string
): Promise<{ access: string; refresh: string; expires: number }> {
  if (Date.now() < tokens.expires) return tokens;

  try {
    const resp = await fetch("https://console.anthropic.com/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh,
        client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const rawData = await resp.json();
      const data = AnthropicOAuthTokenResponseSchema.parse(rawData);
      const newTokens = {
        access: data.access_token,
        refresh: data.refresh_token || tokens.refresh,
        expires: Date.now() + (data.expires_in || 3600) * 1000,
      };

      // Persist refreshed tokens back to the database
      const existing = ProviderCredentialsService.list(userId)
        .find(c => c.provider === "anthropic-oauth" && c.isDefault);
      if (existing) {
        ProviderCredentialsService.update(userId, existing.id, {
          apiKey: JSON.stringify(newTokens),
        });
      }

      return newTokens;
    }
  } catch { /* fall through with original tokens */ }

  return tokens;
}

async function fetchAnthropicOAuthModels(tokens: { access: string; refresh: string; expires: number }, userId: string): Promise<ModelOption[]> {
  try {
    // Auto-refresh expired tokens
    const current = await refreshAnthropicOAuthTokens(tokens, userId);

    const res = await fetch("https://api.anthropic.com/v1/models?beta=true", {
      headers: {
        "Authorization": `Bearer ${current.access}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const rawData = await res.json();
    const data = AnthropicOAuthModelsResponseSchema.parse(rawData);
    return (data.data || [])
      .filter((m) => m.id.includes("claude"))
      .map((m) => ({ id: m.id, name: m.display_name || m.id, providerId: "anthropic-oauth", providerName: "Anthropic (Pro/Max)", isFree: true }))
      .sort((a, b) => {
        const aIdx = PREFERRED_ANTHROPIC.indexOf(a.id);
        const bIdx = PREFERRED_ANTHROPIC.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch { return []; }
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelOption[]> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const rawData = await res.json();
    const data = OpenAIModelsResponseSchema.parse(rawData);
    return (data.data || [])
      .filter((m) => /^(gpt-|o1|o3|chatgpt)/.test(m.id))
      .map((m) => ({ id: m.id, name: m.id, providerId: "openai", providerName: "OpenAI" }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch { return []; }
}

async function fetchGoogleModels(apiKey: string): Promise<ModelOption[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return [];
    const rawData = await res.json();
    const data = GoogleModelsResponseSchema.parse(rawData);
    return (data.models || [])
      .filter((m) => m.name.includes("gemini") && m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({ id: m.name.replace("models/", ""), name: m.displayName || m.name, providerId: "google", providerName: "Google" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

async function fetchOllamaModels(baseUrl: string): Promise<ModelOption[]> {
  try {
    const url = baseUrl.replace(/\/+$/, "");
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const rawData = await res.json();
    const data = OllamaModelsResponseSchema.parse(rawData);
    return (data.models || []).map((m) => ({ id: m.name, name: m.name, providerId: "ollama", providerName: "Ollama" }));
  } catch { return []; }
}

export { credentials };
