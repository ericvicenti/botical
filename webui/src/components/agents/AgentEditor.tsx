import { useState, useEffect } from "react";
import { useUpdateAgent } from "@/lib/api/queries";
import type { AgentConfig } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { ArrowLeft, Save } from "lucide-react";

interface AgentEditorProps {
  projectId: string;
  agent: AgentConfig;
  onBack: () => void;
}

const COMMON_TOOLS = [
  "read_file",
  "write_file",
  "search",
  "web_fetch",
  "web_search",
  "run_command",
  "list_files",
  "edit_file",
];

export function AgentEditor({ projectId, agent, onBack }: AgentEditorProps) {
  const updateAgent = useUpdateAgent();

  const [description, setDescription] = useState(agent.description || "");
  const [prompt, setPrompt] = useState(agent.prompt || "");
  const [modelId, setModelId] = useState(agent.modelId || "");
  const [tools, setTools] = useState<string[]>(agent.tools || []);
  const [mode, setMode] = useState(agent.mode || "all");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDescription(agent.description || "");
    setPrompt(agent.prompt || "");
    setModelId(agent.modelId || "");
    setTools(agent.tools || []);
    setMode(agent.mode || "all");
    setDirty(false);
  }, [agent]);

  const markDirty = () => setDirty(true);

  const toggleTool = (tool: string) => {
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
    markDirty();
  };

  const handleSave = async () => {
    try {
      await updateAgent.mutateAsync({
        projectId,
        name: agent.name,
        description: description || undefined,
        prompt: prompt || undefined,
        modelId: modelId || undefined,
        tools,
        mode,
      });
      setDirty(false);
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const isBuiltin = agent.isBuiltin;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-2 py-1 border-b border-border flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-0.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide flex-1 truncate">
          {agent.name}
        </div>
        {!isBuiltin && (
          <button
            onClick={handleSave}
            disabled={!dirty || updateAgent.isPending}
            className={cn(
              "p-1 rounded text-sm flex items-center gap-1",
              dirty
                ? "text-accent-primary hover:bg-bg-elevated"
                : "text-text-muted opacity-50"
            )}
            title="Save changes"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => { setDescription(e.target.value); markDirty(); }}
            disabled={isBuiltin}
            placeholder="What does this agent do?"
            className={cn(
              "w-full px-2 py-1.5 bg-bg-secondary border border-border rounded text-sm",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:border-accent-primary",
              isBuiltin && "opacity-60"
            )}
          />
        </div>

        {/* Mode */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Mode
          </label>
          <select
            value={mode}
            onChange={(e) => { setMode(e.target.value as AgentConfig["mode"]); markDirty(); }}
            disabled={isBuiltin}
            className={cn(
              "w-full px-2 py-1.5 bg-bg-secondary border border-border rounded text-sm",
              "text-text-primary focus:outline-none focus:border-accent-primary",
              isBuiltin && "opacity-60"
            )}
          >
            <option value="all">All (primary + subagent)</option>
            <option value="primary">Primary only</option>
            <option value="subagent">Subagent only</option>
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Model ID
          </label>
          <input
            type="text"
            value={modelId}
            onChange={(e) => { setModelId(e.target.value); markDirty(); }}
            disabled={isBuiltin}
            placeholder="e.g. claude-sonnet-4-20250514"
            className={cn(
              "w-full px-2 py-1.5 bg-bg-secondary border border-border rounded text-sm",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:border-accent-primary",
              isBuiltin && "opacity-60"
            )}
          />
        </div>

        {/* System Prompt */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            System Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); markDirty(); }}
            disabled={isBuiltin}
            placeholder="System prompt for this agent..."
            rows={8}
            className={cn(
              "w-full px-2 py-1.5 bg-bg-secondary border border-border rounded text-sm",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:border-accent-primary resize-y",
              "font-mono text-xs",
              isBuiltin && "opacity-60"
            )}
          />
        </div>

        {/* Tools */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Tools
          </label>
          <div className="space-y-1">
            {COMMON_TOOLS.map((tool) => (
              <label
                key={tool}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded text-sm",
                  "hover:bg-bg-elevated cursor-pointer",
                  isBuiltin && "opacity-60 pointer-events-none"
                )}
              >
                <input
                  type="checkbox"
                  checked={tools.includes(tool)}
                  onChange={() => toggleTool(tool)}
                  disabled={isBuiltin}
                  className="rounded border-border"
                />
                <span className="text-text-primary font-mono text-xs">{tool}</span>
              </label>
            ))}
          </div>
          {/* Show additional tools that aren't in COMMON_TOOLS */}
          {tools.filter((t) => !COMMON_TOOLS.includes(t)).length > 0 && (
            <div className="mt-2 pt-2 border-t border-border">
              <div className="text-xs text-text-muted mb-1">Additional tools:</div>
              {tools
                .filter((t) => !COMMON_TOOLS.includes(t))
                .map((tool) => (
                  <label
                    key={tool}
                    className="flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-bg-elevated cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggleTool(tool)}
                      disabled={isBuiltin}
                    />
                    <span className="text-text-primary font-mono text-xs">{tool}</span>
                  </label>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
