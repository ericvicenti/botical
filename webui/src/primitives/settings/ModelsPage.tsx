import { useState, useEffect } from "react";
import {
  useCredentials,
  useSaveCredential,
  useDeleteCredential,
  useCheckProviderHealth,
  getLegacySettings,
  clearLegacyKeys,
  type ProviderCredential,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import {
  Eye,
  EyeOff,
  Loader2,
  CircleCheck,
  CircleX,
  LogIn,
  LogOut,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface ModelsPageProps {
  params: Record<string, never>;
  search?: unknown;
}

interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  keyPlaceholder?: string;
  helpUrl?: string;
  helpLabel?: string;
  isUrlBased?: boolean;
  defaultUrl?: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models",
    keyPlaceholder: "sk-ant-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpLabel: "console.anthropic.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models",
    keyPlaceholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpLabel: "platform.openai.com",
  },
  {
    id: "google",
    name: "Google AI",
    description: "Gemini models",
    keyPlaceholder: "AI...",
    helpUrl: "https://aistudio.google.dev/apikey",
    helpLabel: "aistudio.google.dev",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models",
    isUrlBased: true,
    defaultUrl: "http://localhost:11434",
    helpUrl: "https://ollama.ai",
    helpLabel: "ollama.ai",
  },
];

type HealthStatus = "idle" | "checking" | "ok" | "error";

// --- Anthropic OAuth helpers ---
const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const OAUTH_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const OAUTH_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const OAUTH_SCOPES = "org:create_api_key user:profile user:inference";

async function generatePKCE() {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
}

async function exchangeCodeForTokens(rawCode: string, verifier: string) {
  const [code, state] = rawCode.includes("#")
    ? rawCode.split("#")
    : [rawCode, undefined];

  const resp = await fetch("/oauth/anthropic/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      state,
      grant_type: "authorization_code",
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Token exchange failed: ${resp.status} ${body}`);
  }
  const data = await resp.json();
  return {
    access: data.access_token as string,
    refresh: data.refresh_token as string,
    expires: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

export default function ModelsPage(_props: ModelsPageProps) {
  const { data: credentials, isLoading: credsLoading } = useCredentials();
  const saveCredential = useSaveCredential();
  const deleteCredential = useDeleteCredential();
  const checkHealth = useCheckProviderHealth();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [health, setHealth] = useState<Record<string, HealthStatus>>({});
  const [healthMsg, setHealthMsg] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [migrated, setMigrated] = useState(false);

  // OAuth state
  const [oauthState, setOauthState] = useState<"idle" | "waiting" | "exchanging" | "connected" | "error">("idle");
  const [oauthError, setOauthError] = useState("");
  const [oauthCodeInput, setOauthCodeInput] = useState("");
  const [pkceVerifier, setPkceVerifier] = useState<string | null>(null);

  // Build a set of configured providers from server credentials
  const configuredProviders = new Set(
    (credentials || []).map((c: ProviderCredential) => c.provider)
  );

  // Check if OAuth is configured
  useEffect(() => {
    if (configuredProviders.has("anthropic-oauth")) {
      setOauthState("connected");
    }
  }, [credentials]);

  // Migrate legacy localStorage keys on first load
  useEffect(() => {
    if (migrated || credsLoading || !credentials) return;
    setMigrated(true);

    const legacy = getLegacySettings();
    if (!legacy) return;

    const migrations: Promise<unknown>[] = [];
    const PROVIDER_KEY_MAP: Record<string, string> = {
      anthropic: "anthropicApiKey",
      openai: "openaiApiKey",
      google: "googleApiKey",
      ollama: "ollamaBaseUrl",
    };

    for (const [provider, settingsKey] of Object.entries(PROVIDER_KEY_MAP)) {
      const val = (legacy as unknown as Record<string, unknown>)[settingsKey] as string | undefined;
      if (val && !configuredProviders.has(provider)) {
        migrations.push(
          fetch("/api/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, apiKey: val }),
          })
        );
      }
    }

    // Migrate OAuth tokens
    if (legacy.anthropicOAuthTokens && !configuredProviders.has("anthropic-oauth")) {
      migrations.push(
        fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "anthropic-oauth",
            apiKey: JSON.stringify(legacy.anthropicOAuthTokens),
          }),
        })
      );
    }

    if (migrations.length > 0) {
      Promise.allSettled(migrations).then(() => {
        clearLegacyKeys();
        queryClient.invalidateQueries({ queryKey: ["credentials"] });
        queryClient.invalidateQueries({ queryKey: ["available-models"] });
      });
    }
  }, [credentials, credsLoading, migrated]);

  // Run health checks for configured providers
  useEffect(() => {
    if (!credentials) return;
    for (const cred of credentials) {
      if (cred.provider === "anthropic-oauth") continue; // OAuth handled separately
      if (health[cred.provider] && health[cred.provider] !== "idle") continue;
      setHealth((prev) => ({ ...prev, [cred.provider]: "checking" }));
      checkHealth.mutateAsync(cred.provider).then((result) => {
        setHealth((prev) => ({ ...prev, [cred.provider]: result.status === "ok" ? "ok" : "error" }));
        setHealthMsg((prev) => ({ ...prev, [cred.provider]: result.message }));
      }).catch(() => {
        setHealth((prev) => ({ ...prev, [cred.provider]: "error" }));
        setHealthMsg((prev) => ({ ...prev, [cred.provider]: "Health check failed" }));
      });
    }
  }, [credentials]);

  const handleValueChange = (providerId: string, val: string) => {
    setValues((prev) => ({ ...prev, [providerId]: val }));
    setHealth((prev) => ({ ...prev, [providerId]: "idle" }));
  };

  const handleSaveProvider = async (providerId: string) => {
    const value = values[providerId];
    if (!value) {
      // Delete credential
      const cred = (credentials || []).find(
        (c: ProviderCredential) => c.provider === providerId && c.isDefault
      );
      if (cred) {
        await deleteCredential.mutateAsync(cred.id);
      }
      setHealth((prev) => ({ ...prev, [providerId]: "idle" }));
      setHealthMsg((prev) => ({ ...prev, [providerId]: "" }));
      return;
    }

    setSaving(true);
    try {
      await saveCredential.mutateAsync({ provider: providerId, apiKey: value });
      setValues((prev) => ({ ...prev, [providerId]: "" })); // Clear input after save
      // Run health check
      setHealth((prev) => ({ ...prev, [providerId]: "checking" }));
      const result = await checkHealth.mutateAsync(providerId);
      setHealth((prev) => ({ ...prev, [providerId]: result.status === "ok" ? "ok" : "error" }));
      setHealthMsg((prev) => ({ ...prev, [providerId]: result.message }));
    } catch (err) {
      setHealth((prev) => ({ ...prev, [providerId]: "error" }));
      setHealthMsg((prev) => ({
        ...prev,
        [providerId]: err instanceof Error ? err.message : "Save failed",
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    const cred = (credentials || []).find(
      (c: ProviderCredential) => c.provider === providerId && c.isDefault
    );
    if (cred) {
      await deleteCredential.mutateAsync(cred.id);
      setHealth((prev) => ({ ...prev, [providerId]: "idle" }));
      setHealthMsg((prev) => ({ ...prev, [providerId]: "" }));
      setValues((prev) => ({ ...prev, [providerId]: "" }));
    }
  };

  if (credsLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-text-primary mb-2">
        Model Providers
      </h1>
      <p className="text-text-muted mb-8">
        Enable the AI providers you want to use. Keys are stored securely on the server.
      </p>

      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const isConfigured = configuredProviders.has(provider.id);
          const value = values[provider.id] || "";
          const status = health[provider.id] || "idle";
          const msg = healthMsg[provider.id] || "";

          return (
            <div
              key={provider.id}
              className={cn(
                "border rounded-lg transition-colors",
                isConfigured
                  ? "border-accent-primary/40 bg-accent-primary/5"
                  : "border-border bg-bg-secondary/50"
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">
                      {provider.name}
                    </span>
                    <span className="text-xs text-text-muted">
                      {provider.description}
                    </span>
                  </div>
                </div>
                {/* Health indicator */}
                {isConfigured && status !== "idle" && (
                  <div className="flex items-center gap-1.5">
                    {status === "checking" && (
                      <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
                    )}
                    {status === "ok" && (
                      <CircleCheck className="w-4 h-4 text-green-500" />
                    )}
                    {status === "error" && (
                      <CircleX className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="px-4 pb-4 pt-0">
                {isConfigured && !value ? (
                  /* Configured - show status */
                  <div className="flex items-center justify-between">
                    <div>
                      {msg && (
                        <p
                          className={cn(
                            "text-xs",
                            status === "ok"
                              ? "text-green-600 dark:text-green-400"
                              : status === "error"
                                ? "text-red-600 dark:text-red-400"
                                : "text-text-muted"
                          )}
                        >
                          {msg}
                        </p>
                      )}
                      <p className="text-xs text-text-muted mt-1">
                        {provider.isUrlBased ? "URL" : "API key"} configured ·{" "}
                        <button
                          type="button"
                          onClick={() => setValues((prev) => ({ ...prev, [provider.id]: " " }))}
                          className="text-accent-primary hover:underline"
                        >
                          Update
                        </button>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => handleRemoveProvider(provider.id)}
                          className="text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Input for new/update */
                  <div>
                    <div className="relative">
                      <input
                        type={
                          provider.isUrlBased || showKeys[provider.id]
                            ? "text"
                            : "password"
                        }
                        value={value === " " ? "" : value}
                        onChange={(e) =>
                          handleValueChange(provider.id, e.target.value)
                        }
                        placeholder={
                          provider.isUrlBased
                            ? provider.defaultUrl
                            : provider.keyPlaceholder
                        }
                        className={cn(
                          "w-full px-3 py-2 bg-bg-primary border border-border rounded-lg",
                          "text-text-primary placeholder:text-text-muted",
                          "focus:outline-none focus:border-accent-primary",
                          "font-mono text-sm",
                          !provider.isUrlBased && "pr-10"
                        )}
                        data-testid={`input-${provider.id}`}
                      />
                      {!provider.isUrlBased && (
                        <button
                          type="button"
                          onClick={() =>
                            setShowKeys((prev) => ({
                              ...prev,
                              [provider.id]: !prev[provider.id],
                            }))
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
                        >
                          {showKeys[provider.id] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => handleSaveProvider(provider.id)}
                        disabled={saving || (!value || value === " ")}
                        className="px-3 py-1.5 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {saving ? "Saving..." : isConfigured ? "Update" : "Save"}
                      </button>
                      {isConfigured && (
                        <button
                          type="button"
                          onClick={() => setValues((prev) => ({ ...prev, [provider.id]: "" }))}
                          className="px-3 py-1.5 text-text-muted hover:text-text-primary text-sm"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {provider.helpUrl && (
                      <p className="text-xs text-text-muted mt-2">
                        {provider.isUrlBased ? "Download from " : "Get your key from "}
                        <a
                          href={provider.helpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-primary hover:underline"
                        >
                          {provider.helpLabel}
                        </a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Anthropic OAuth Card */}
      <div className="mt-4">
        <div
          className={cn(
            "border rounded-lg transition-colors",
            oauthState === "connected"
              ? "border-green-500/40 bg-green-500/5"
              : "border-border bg-bg-secondary/50"
          )}
        >
          <div className="flex items-center gap-3 p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">
                  Anthropic (OAuth)
                </span>
                <span className="text-xs text-text-muted">
                  Claude Pro/Max — free via subscription
                </span>
                <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded-full font-medium">
                  $0
                </span>
              </div>
            </div>
            {oauthState === "connected" && (
              <CircleCheck className="w-4 h-4 text-green-500" />
            )}
          </div>
          <div className="px-4 pb-4 pt-0">
            {oauthState === "idle" && (
              <button
                type="button"
                onClick={async () => {
                  const { verifier, challenge } = await generatePKCE();
                  setPkceVerifier(verifier);
                  const params = new URLSearchParams({
                    code: "true",
                    client_id: OAUTH_CLIENT_ID,
                    response_type: "code",
                    redirect_uri: OAUTH_REDIRECT_URI,
                    scope: OAUTH_SCOPES,
                    code_challenge: challenge,
                    code_challenge_method: "S256",
                    state: verifier,
                  });
                  window.open(`${OAUTH_AUTHORIZE_URL}?${params}`, "_blank");
                  setOauthState("waiting");
                }}
                className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors font-medium text-sm"
              >
                <LogIn className="w-4 h-4" />
                Sign in with Claude
              </button>
            )}
            {oauthState === "waiting" && (
              <div className="space-y-3">
                <p className="text-sm text-text-muted">
                  After authorizing, paste the <code className="text-xs bg-bg-elevated px-1 py-0.5 rounded">code#state</code> from the callback page:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={oauthCodeInput}
                    onChange={(e) => setOauthCodeInput(e.target.value)}
                    placeholder="paste code#state here"
                    className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted font-mono text-sm focus:outline-none focus:border-accent-primary"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setOauthState("exchanging");
                      setOauthError("");
                      try {
                        const raw = oauthCodeInput.trim();
                        if (!pkceVerifier) throw new Error("Missing PKCE verifier");
                        const tokens = await exchangeCodeForTokens(raw, pkceVerifier);
                        // Save OAuth tokens as a server credential
                        await saveCredential.mutateAsync({
                          provider: "anthropic-oauth",
                          apiKey: JSON.stringify(tokens),
                        });
                        setOauthState("connected");
                        setOauthCodeInput("");
                      } catch (err) {
                        setOauthError(err instanceof Error ? err.message : "Exchange failed");
                        setOauthState("waiting");
                      }
                    }}
                    disabled={!oauthCodeInput.trim()}
                    className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors font-medium text-sm disabled:opacity-50"
                  >
                    Connect
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOauthState("idle");
                    setOauthCodeInput("");
                    setOauthError("");
                  }}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>
            )}
            {oauthState === "exchanging" && (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Exchanging code for tokens...
              </div>
            )}
            {oauthState === "connected" && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-green-600 dark:text-green-400">
                  Connected — using your Claude subscription
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const cred = (credentials || []).find(
                      (c: ProviderCredential) => c.provider === "anthropic-oauth"
                    );
                    if (cred) await deleteCredential.mutateAsync(cred.id);
                    setOauthState("idle");
                  }}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-red-500 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>
            )}
            {oauthError && oauthState === "waiting" && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                {oauthError}
              </p>
            )}
            <p className="text-xs text-text-muted mt-2">
              Use your Claude Pro or Max subscription for API access at no additional cost.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
