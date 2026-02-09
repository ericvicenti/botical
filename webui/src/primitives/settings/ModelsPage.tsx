import { useState, useEffect, useCallback } from "react";
import { useSettings, useSaveSettings } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import {
  Save,
  Eye,
  EyeOff,
  Check,
  Loader2,
  CircleCheck,
  CircleX,
  CircleDashed,
} from "lucide-react";

interface ModelsPageProps {
  params: Record<string, never>;
  search?: unknown;
}

interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  keyPlaceholder?: string;
  keyPrefix?: string;
  helpUrl?: string;
  helpLabel?: string;
  isUrlBased?: boolean; // e.g. Ollama — no API key, just a URL
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

const SETTINGS_KEY_MAP: Record<string, string> = {
  anthropic: "anthropicApiKey",
  openai: "openaiApiKey",
  google: "googleApiKey",
  ollama: "ollamaBaseUrl",
};

export default function ModelsPage(_props: ModelsPageProps) {
  const { data: settings, isLoading } = useSettings();
  const saveSettings = useSaveSettings();

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [health, setHealth] = useState<Record<string, HealthStatus>>({});
  const [healthMsg, setHealthMsg] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      const newEnabled: Record<string, boolean> = {};
      const newValues: Record<string, string> = {};
      for (const p of PROVIDERS) {
        const key = SETTINGS_KEY_MAP[p.id];
        const val = (settings as Record<string, unknown>)[key] as string | undefined;
        newValues[p.id] = val || "";
        newEnabled[p.id] = !!val;
      }
      setEnabled(newEnabled);
      setValues(newValues);
    }
  }, [settings]);

  const handleToggle = (providerId: string) => {
    const provider = PROVIDERS.find((p) => p.id === providerId)!;
    const newState = !enabled[providerId];
    setEnabled((prev) => ({ ...prev, [providerId]: newState }));
    if (newState && provider.isUrlBased && !values[providerId]) {
      setValues((prev) => ({ ...prev, [providerId]: provider.defaultUrl || "" }));
    }
    if (!newState) {
      setValues((prev) => ({ ...prev, [providerId]: "" }));
      setHealth((prev) => ({ ...prev, [providerId]: "idle" }));
      setHealthMsg((prev) => ({ ...prev, [providerId]: "" }));
    }
  };

  const handleValueChange = (providerId: string, val: string) => {
    setValues((prev) => ({ ...prev, [providerId]: val }));
    // Auto-enable when user types a key
    if (val && !enabled[providerId]) {
      setEnabled((prev) => ({ ...prev, [providerId]: true }));
    }
    // Reset health on change
    setHealth((prev) => ({ ...prev, [providerId]: "idle" }));
  };

  const handleSave = async () => {
    if (!settings) return;

    const updated = { ...settings } as Record<string, unknown>;
    for (const p of PROVIDERS) {
      const key = SETTINGS_KEY_MAP[p.id];
      updated[key] = enabled[p.id] ? values[p.id] || undefined : undefined;
    }

    await saveSettings.mutateAsync(updated as typeof settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Auto-check health on page load and when values change (debounced)
  useEffect(() => {
    const toCheck = PROVIDERS.filter(
      (p) => enabled[p.id] && values[p.id] && health[p.id] === "idle"
    );
    if (toCheck.length === 0) return;

    const timer = setTimeout(() => {
      for (const p of toCheck) {
        checkHealth(p.id);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [enabled, values, health]);

  const checkHealth = useCallback(async (providerId: string) => {
    const value = values[providerId];
    if (!value) return;

    setHealth((prev) => ({ ...prev, [providerId]: "checking" }));
    setHealthMsg((prev) => ({ ...prev, [providerId]: "" }));

    try {
      const provider = PROVIDERS.find((p) => p.id === providerId)!;

      if (provider.isUrlBased) {
        // Ollama: just check if the server responds
        const resp = await fetch(value + "/api/tags", {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const modelCount = data.models?.length || 0;
          setHealth((prev) => ({ ...prev, [providerId]: "ok" }));
          setHealthMsg((prev) => ({
            ...prev,
            [providerId]: `Connected — ${modelCount} model${modelCount !== 1 ? "s" : ""} available`,
          }));
        } else {
          throw new Error(`HTTP ${resp.status}`);
        }
      } else {
        // API key providers: use a lightweight API call
        let testUrl = "";
        let testHeaders: Record<string, string> = {};

        if (providerId === "anthropic") {
          testUrl = "https://api.anthropic.com/v1/models?limit=1";
          testHeaders = {
            "x-api-key": value,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          };
        } else if (providerId === "openai") {
          testUrl = "https://api.openai.com/v1/models?limit=1";
          testHeaders = { Authorization: `Bearer ${value}` };
        } else if (providerId === "google") {
          testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${value}&pageSize=1`;
        }

        const resp = await fetch(testUrl, {
          headers: testHeaders,
          signal: AbortSignal.timeout(10000),
        });

        if (resp.ok) {
          setHealth((prev) => ({ ...prev, [providerId]: "ok" }));
          setHealthMsg((prev) => ({ ...prev, [providerId]: "API key is valid" }));
        } else {
          const body = await resp.text().catch(() => "");
          let msg = `HTTP ${resp.status}`;
          try {
            const j = JSON.parse(body);
            msg = j.error?.message || j.error?.type || msg;
          } catch {
            // ignore
          }
          setHealth((prev) => ({ ...prev, [providerId]: "error" }));
          setHealthMsg((prev) => ({ ...prev, [providerId]: msg }));
        }
      }
    } catch (err) {
      setHealth((prev) => ({ ...prev, [providerId]: "error" }));
      setHealthMsg((prev) => ({
        ...prev,
        [providerId]:
          err instanceof Error
            ? err.name === "TimeoutError"
              ? "Connection timed out"
              : err.message
            : "Connection failed",
      }));
    }
  }, [values]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-text-primary mb-2">
        Model Providers
      </h1>
      <p className="text-text-muted mb-8">
        Enable the AI providers you want to use.
      </p>

      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const isEnabled = enabled[provider.id] || false;
          const value = values[provider.id] || "";
          const status = health[provider.id] || "idle";
          const msg = healthMsg[provider.id] || "";

          return (
            <div
              key={provider.id}
              className={cn(
                "border rounded-lg transition-colors",
                isEnabled
                  ? "border-accent-primary/40 bg-accent-primary/5"
                  : "border-border bg-bg-secondary/50"
              )}
            >
              {/* Header with checkbox */}
              <div className="flex items-center gap-3 p-4">
                <button
                  type="button"
                  onClick={() => handleToggle(provider.id)}
                  className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                    isEnabled
                      ? "bg-accent-primary border-accent-primary"
                      : "border-border hover:border-text-muted"
                  )}
                  data-testid={`toggle-${provider.id}`}
                >
                  {isEnabled && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
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
                {isEnabled && value && status !== "idle" && (
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

              {/* Expanded content when enabled */}
              {isEnabled && (
                <div className="px-4 pb-4 pt-0">
                  <div className="relative">
                    <input
                      type={
                        provider.isUrlBased || showKeys[provider.id]
                          ? "text"
                          : "password"
                      }
                      value={value}
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

                  {/* Health message */}
                  {msg && (
                    <p
                      className={cn(
                        "text-xs mt-1.5",
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

                  {/* Help link */}
                  {provider.helpUrl && (
                    <p className="text-xs text-text-muted mt-1.5">
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
          );
        })}
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4 pt-6">
        <button
          onClick={handleSave}
          disabled={saveSettings.isPending}
          className={cn(
            "px-6 py-2.5 rounded-lg font-medium",
            "flex items-center gap-2 transition-colors",
            "bg-accent-primary text-white hover:bg-accent-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          data-testid="save-settings-button"
        >
          {saveSettings.isPending ? (
            <>Saving...</>
          ) : saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
