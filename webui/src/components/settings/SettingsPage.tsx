import { useState, useEffect } from "react";
import { useSettings, useSaveSettings, type AgentClass, DEFAULT_AGENT_CLASSES } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { Save, Eye, EyeOff, Check, AlertCircle, Plus, Pencil, Trash2, X } from "lucide-react";

// Available models by provider
const PROVIDER_MODELS: Record<"anthropic" | "openai" | "google", { id: string; name: string }[]> = {
  anthropic: [
    { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
  ],
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    { id: "o1", name: "o1" },
  ],
  google: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  ],
};

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const saveSettings = useSaveSettings();

  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [defaultProvider, setDefaultProvider] = useState<"anthropic" | "openai" | "google">("anthropic");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  // Agent Classes state
  const [agentClasses, setAgentClasses] = useState<AgentClass[]>(DEFAULT_AGENT_CLASSES);
  const [defaultAgentClass, setDefaultAgentClass] = useState("medium");
  const [editingClass, setEditingClass] = useState<AgentClass | null>(null);
  const [isAddingClass, setIsAddingClass] = useState(false);

  // Load settings when available
  useEffect(() => {
    if (settings) {
      setAnthropicKey(settings.anthropicApiKey || "");
      setOpenaiKey(settings.openaiApiKey || "");
      setGoogleKey(settings.googleApiKey || "");
      setDefaultProvider(settings.defaultProvider || "anthropic");
      setAgentClasses(settings.agentClasses || DEFAULT_AGENT_CLASSES);
      setDefaultAgentClass(settings.defaultAgentClass || "medium");
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
      agentClasses,
      defaultAgentClass,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddClass = () => {
    setEditingClass({
      id: "",
      name: "",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
    });
    setIsAddingClass(true);
  };

  const handleEditClass = (cls: AgentClass) => {
    setEditingClass({ ...cls });
    setIsAddingClass(false);
  };

  const handleDeleteClass = (id: string) => {
    if (agentClasses.length <= 1) {
      alert("You must have at least one agent class.");
      return;
    }
    setAgentClasses(agentClasses.filter((c) => c.id !== id));
    if (defaultAgentClass === id) {
      setDefaultAgentClass(agentClasses.find((c) => c.id !== id)?.id || "");
    }
  };

  const handleSaveClass = () => {
    if (!editingClass) return;

    // Generate ID from name if adding new
    const classId = isAddingClass
      ? editingClass.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : editingClass.id;

    if (!classId || !editingClass.name) {
      alert("Please enter a name for the agent class.");
      return;
    }

    // Check for duplicate ID when adding
    if (isAddingClass && agentClasses.some((c) => c.id === classId)) {
      alert("An agent class with this name already exists.");
      return;
    }

    const updatedClass: AgentClass = {
      ...editingClass,
      id: classId,
    };

    if (isAddingClass) {
      setAgentClasses([...agentClasses, updatedClass]);
    } else {
      setAgentClasses(agentClasses.map((c) => (c.id === editingClass.id ? updatedClass : c)));
    }

    setEditingClass(null);
    setIsAddingClass(false);
  };

  const handleCancelEdit = () => {
    setEditingClass(null);
    setIsAddingClass(false);
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

        {/* Agent Classes Section */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Agent Classes</h2>
          <p className="text-sm text-text-muted mb-4">
            Define agent classes that map names to specific providers and models.
            These can be used in task templates.
          </p>

          <div className="space-y-3 mb-4">
            {agentClasses.map((cls) => (
              <div
                key={cls.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 bg-bg-secondary border rounded-lg",
                  defaultAgentClass === cls.id ? "border-accent-primary" : "border-border"
                )}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{cls.name}</span>
                    <span className="text-xs text-text-muted px-1.5 py-0.5 bg-bg-elevated rounded">
                      {cls.id}
                    </span>
                    {defaultAgentClass === cls.id && (
                      <span className="text-xs text-accent-primary px-1.5 py-0.5 bg-accent-primary/10 rounded">
                        default
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-text-muted mt-1">
                    {cls.providerId} / {cls.modelId}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {defaultAgentClass !== cls.id && (
                    <button
                      onClick={() => setDefaultAgentClass(cls.id)}
                      className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded hover:bg-bg-elevated"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleEditClass(cls)}
                    className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-elevated rounded"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClass(cls.id)}
                    className="p-1.5 text-text-muted hover:text-accent-error hover:bg-accent-error/10 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddClass}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border border-dashed border-border rounded-lg",
              "text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors"
            )}
          >
            <Plus className="w-4 h-4" />
            Add Agent Class
          </button>

          {/* Edit/Add Class Modal */}
          {editingClass && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-bg-primary border border-border rounded-lg p-6 w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-text-primary">
                    {isAddingClass ? "Add Agent Class" : "Edit Agent Class"}
                  </h3>
                  <button
                    onClick={handleCancelEdit}
                    className="p-1 text-text-muted hover:text-text-primary"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editingClass.name}
                      onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
                      placeholder="e.g. Smart"
                      className={cn(
                        "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                        "text-text-primary placeholder:text-text-muted",
                        "focus:outline-none focus:border-accent-primary"
                      )}
                    />
                    {isAddingClass && editingClass.name && (
                      <p className="text-xs text-text-muted mt-1">
                        ID: {editingClass.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
                      </p>
                    )}
                  </div>

                  {/* Provider */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Provider
                    </label>
                    <select
                      value={editingClass.providerId}
                      onChange={(e) => {
                        const providerId = e.target.value as "anthropic" | "openai" | "google";
                        const firstModel = PROVIDER_MODELS[providerId][0]?.id || "";
                        setEditingClass({ ...editingClass, providerId, modelId: firstModel });
                      }}
                      className={cn(
                        "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                        "text-text-primary",
                        "focus:outline-none focus:border-accent-primary"
                      )}
                    >
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="google">Google</option>
                    </select>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Model
                    </label>
                    <select
                      value={editingClass.modelId}
                      onChange={(e) => setEditingClass({ ...editingClass, modelId: e.target.value })}
                      className={cn(
                        "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                        "text-text-primary",
                        "focus:outline-none focus:border-accent-primary"
                      )}
                    >
                      {PROVIDER_MODELS[editingClass.providerId].map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 text-text-secondary hover:text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveClass}
                    className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90"
                  >
                    {isAddingClass ? "Add Class" : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          )}
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
