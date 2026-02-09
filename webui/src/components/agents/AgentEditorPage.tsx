import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAgent, useUpdateAgent, useDeleteAgent, useSettings } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { ArrowLeft, Save, Trash2, Bot, ChevronDown, Wrench, Sparkles } from "lucide-react";
import { ToolsPanel } from "@/components/tasks/ToolsPanel";
import { SkillsPanel } from "@/components/tasks/SkillsPanel";

// Model definitions matching TaskChat.tsx
interface ModelOption {
  id: string;
  name: string;
  providerId: "anthropic" | "openai" | "google";
  providerName: string;
}

const AVAILABLE_MODELS: ModelOption[] = [
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", providerId: "anthropic", providerName: "Anthropic" },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", providerId: "anthropic", providerName: "Anthropic" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", providerId: "anthropic", providerName: "Anthropic" },
  { id: "gpt-4o", name: "GPT-4o", providerId: "openai", providerName: "OpenAI" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", providerId: "openai", providerName: "OpenAI" },
  { id: "o1", name: "o1", providerId: "openai", providerName: "OpenAI" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", providerId: "google", providerName: "Google" },
  { id: "gemini-2.0-flash-thinking-exp", name: "Gemini 2.0 Flash Thinking", providerId: "google", providerName: "Google" },
];

interface AgentEditorPageProps {
  projectId: string;
  agentName: string;
}

export function AgentEditorPage({ projectId, agentName }: AgentEditorPageProps) {
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(agentName, projectId);
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const { data: settings } = useSettings();

  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [showSkillsPanel, setShowSkillsPanel] = useState(false);

  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent) {
      setDescription(agent.description || "");
      setPrompt(agent.prompt || "");
      setModelId(agent.modelId || "");
      setTools(agent.tools || []);
      setDirty(false);
    }
  }, [agent]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const availableModels = useMemo(() => {
    if (!settings) return AVAILABLE_MODELS;
    return AVAILABLE_MODELS.filter(model => {
      if (model.providerId === "anthropic" && settings.anthropicApiKey) return true;
      if (model.providerId === "openai" && settings.openaiApiKey) return true;
      if (model.providerId === "google" && settings.googleApiKey) return true;
      return false;
    });
  }, [settings]);

  const currentModel = availableModels.find(m => m.id === modelId) || null;
  const markDirty = () => setDirty(true);
  const enabledToolsSet = useMemo(() => new Set(tools), [tools]);

  const handleToggleTool = (toolName: string) => {
    setTools(prev =>
      prev.includes(toolName) ? prev.filter(t => t !== toolName) : [...prev, toolName]
    );
    markDirty();
  };

  const handleToggleSkill = (skillName: string, enabled: boolean) => {
    setEnabledSkills(prev => {
      const next = new Set(prev);
      if (enabled) next.add(skillName);
      else next.delete(skillName);
      return next;
    });
    markDirty();
  };

  const handleSave = async () => {
    if (!agent) return;
    try {
      await updateAgent.mutateAsync({
        projectId,
        name: agent.name,
        description: description || undefined,
        prompt: prompt || undefined,
        modelId: modelId || undefined,
        tools,
      });
      setDirty(false);
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleDelete = async () => {
    if (!agent || agent.isBuiltin) return;
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    try {
      await deleteAgent.mutateAsync({ projectId, name: agent.name });
      navigate({ to: "/projects/$projectId", params: { projectId } });
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading agent...
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Agent not found
      </div>
    );
  }

  const isBuiltin = agent.isBuiltin;

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/projects/$projectId", params: { projectId } })}
          className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Bot className="w-5 h-5 text-accent-primary" />
        <h1 className="text-lg font-semibold text-text-primary flex-1">{agent.name}</h1>
        {isBuiltin && (
          <span className="text-xs text-text-muted px-2 py-1 bg-bg-elevated rounded">built-in</span>
        )}
        {!isBuiltin && (
          <>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-text-muted hover:text-accent-error hover:bg-bg-elevated transition-colors"
              title="Delete agent"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || updateAgent.isPending}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors",
                dirty
                  ? "bg-accent-primary text-white hover:bg-accent-primary/90"
                  : "bg-bg-elevated text-text-muted"
              )}
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => { setDescription(e.target.value); markDirty(); }}
              disabled={isBuiltin}
              placeholder="What does this agent do?"
              className={cn(
                "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent-primary",
                isBuiltin && "opacity-60"
              )}
            />
          </div>

          {/* Model Dropdown */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Model</label>
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => !isBuiltin && setShowModelDropdown(!showModelDropdown)}
                disabled={isBuiltin || availableModels.length === 0}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm",
                  "bg-bg-secondary border border-border",
                  "hover:border-accent-primary/50 transition-colors text-text-primary",
                  (isBuiltin || availableModels.length === 0) && "opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-accent-primary shrink-0" />
                  <span>{currentModel?.name || modelId || "Select model"}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-text-muted" />
              </button>
              {showModelDropdown && availableModels.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-bg-primary border border-border rounded-lg shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => { setModelId(""); setShowModelDropdown(false); markDirty(); }}
                      className={cn(
                        "w-full px-3 py-2 text-left hover:bg-bg-elevated transition-colors text-sm text-text-muted",
                        !modelId && "bg-bg-elevated"
                      )}
                    >
                      Default (inherit from settings)
                    </button>
                    {["anthropic", "openai", "google"].map(providerId => {
                      const providerModels = availableModels.filter(m => m.providerId === providerId);
                      if (providerModels.length === 0) return null;
                      return (
                        <div key={providerId}>
                          <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider bg-bg-secondary">
                            {providerModels[0]?.providerName}
                          </div>
                          {providerModels.map(model => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => { setModelId(model.id); setShowModelDropdown(false); markDirty(); }}
                              className={cn(
                                "w-full px-3 py-2 text-left hover:bg-bg-elevated transition-colors",
                                modelId === model.id && "bg-bg-elevated"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-text-primary">{model.name}</span>
                                {modelId === model.id && (
                                  <div className="w-2 h-2 rounded-full bg-accent-primary shrink-0 ml-auto" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">System Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); markDirty(); }}
              disabled={isBuiltin}
              placeholder="System prompt for this agent..."
              rows={10}
              className={cn(
                "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent-primary resize-y",
                "font-mono text-xs leading-relaxed",
                isBuiltin && "opacity-60"
              )}
            />
          </div>

          {/* Tools */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                <Wrench className="w-4 h-4" /> Tools
              </label>
              <button
                onClick={() => setShowToolsPanel(!showToolsPanel)}
                className="text-xs text-accent-primary hover:underline"
              >
                {showToolsPanel ? "Hide" : "Configure"}
              </button>
            </div>
            {showToolsPanel && !isBuiltin && (
              <div className="border border-border rounded-lg overflow-hidden max-h-96">
                <ToolsPanel enabledTools={enabledToolsSet} onToggleTool={handleToggleTool} />
              </div>
            )}
            {!showToolsPanel && tools.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tools.map(tool => (
                  <span key={tool} className="px-2 py-0.5 text-xs font-mono bg-bg-elevated rounded text-text-secondary">
                    {tool}
                  </span>
                ))}
              </div>
            )}
            {!showToolsPanel && tools.length === 0 && (
              <p className="text-xs text-text-muted">No tools selected (all tools available)</p>
            )}
          </div>

          {/* Skills */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Skills
              </label>
              <button
                onClick={() => setShowSkillsPanel(!showSkillsPanel)}
                className="text-xs text-accent-primary hover:underline"
              >
                {showSkillsPanel ? "Hide" : "Configure"}
              </button>
            </div>
            {showSkillsPanel && !isBuiltin && (
              <div className="border border-border rounded-lg overflow-hidden max-h-96">
                <SkillsPanel
                  projectId={projectId}
                  enabledSkills={enabledSkills}
                  loadedSkills={new Set()}
                  onToggleSkill={handleToggleSkill}
                  onOpenSkillFile={() => {}}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
