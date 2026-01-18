import { useState, useEffect } from "react";
import { useSettings, useSaveSettings } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { Save, Eye, EyeOff, Check, AlertCircle } from "lucide-react";

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const saveSettings = useSaveSettings();

  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [defaultProvider, setDefaultProvider] = useState<"anthropic" | "openai" | "google">("anthropic");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  // Load settings when available
  useEffect(() => {
    if (settings) {
      setAnthropicKey(settings.anthropicApiKey || "");
      setOpenaiKey(settings.openaiApiKey || "");
      setGoogleKey(settings.googleApiKey || "");
      setDefaultProvider(settings.defaultProvider || "anthropic");
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings) return;

    await saveSettings.mutateAsync({
      ...settings,
      anthropicApiKey: anthropicKey || undefined,
      openaiApiKey: openaiKey || undefined,
      googleApiKey: googleKey || undefined,
      defaultProvider,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleShowKey = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Settings</h1>
        <p className="text-text-muted mb-8">
          Configure your AI provider API keys and preferences.
        </p>

        {/* API Keys Section */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">API Keys</h2>
          <p className="text-sm text-text-muted mb-4">
            Your API keys are stored locally in your browser and never sent to our servers.
          </p>

          <div className="space-y-4">
            {/* Anthropic */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Anthropic API Key
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showKeys.anthropic ? "text" : "password"}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className={cn(
                      "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                      "text-text-primary placeholder:text-text-muted",
                      "focus:outline-none focus:border-accent-primary",
                      "font-mono text-sm"
                    )}
                    data-testid="anthropic-api-key-input"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey("anthropic")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
                  >
                    {showKeys.anthropic ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Get your key from{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>

            {/* OpenAI */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                OpenAI API Key
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showKeys.openai ? "text" : "password"}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className={cn(
                      "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                      "text-text-primary placeholder:text-text-muted",
                      "focus:outline-none focus:border-accent-primary",
                      "font-mono text-sm"
                    )}
                    data-testid="openai-api-key-input"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey("openai")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
                  >
                    {showKeys.openai ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Google */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Google AI API Key
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showKeys.google ? "text" : "password"}
                    value={googleKey}
                    onChange={(e) => setGoogleKey(e.target.value)}
                    placeholder="AI..."
                    className={cn(
                      "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                      "text-text-primary placeholder:text-text-muted",
                      "focus:outline-none focus:border-accent-primary",
                      "font-mono text-sm"
                    )}
                    data-testid="google-api-key-input"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey("google")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
                  >
                    {showKeys.google ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Default Provider Section */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Default Provider</h2>
          <p className="text-sm text-text-muted mb-4">
            Choose which AI provider to use by default for new tasks.
          </p>

          <div className="flex gap-3">
            {(["anthropic", "openai", "google"] as const).map((provider) => (
              <button
                key={provider}
                onClick={() => setDefaultProvider(provider)}
                className={cn(
                  "px-4 py-2 rounded-lg border transition-colors capitalize",
                  defaultProvider === provider
                    ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                    : "border-border text-text-secondary hover:border-text-muted"
                )}
                data-testid={`provider-${provider}`}
              >
                {provider}
              </button>
            ))}
          </div>
        </section>

        {/* Warning if no key for default provider */}
        {defaultProvider === "anthropic" && !anthropicKey && (
          <div className="mb-6 px-4 py-3 bg-accent-warning/10 border border-accent-warning/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent-warning shrink-0 mt-0.5" />
            <p className="text-sm text-text-primary">
              You've selected Anthropic as your default provider, but no API key is configured.
              Please add your Anthropic API key above.
            </p>
          </div>
        )}
        {defaultProvider === "openai" && !openaiKey && (
          <div className="mb-6 px-4 py-3 bg-accent-warning/10 border border-accent-warning/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent-warning shrink-0 mt-0.5" />
            <p className="text-sm text-text-primary">
              You've selected OpenAI as your default provider, but no API key is configured.
              Please add your OpenAI API key above.
            </p>
          </div>
        )}
        {defaultProvider === "google" && !googleKey && (
          <div className="mb-6 px-4 py-3 bg-accent-warning/10 border border-accent-warning/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent-warning shrink-0 mt-0.5" />
            <p className="text-sm text-text-primary">
              You've selected Google as your default provider, but no API key is configured.
              Please add your Google AI API key above.
            </p>
          </div>
        )}

        {/* Save Button */}
        <div className="flex items-center gap-4">
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
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
