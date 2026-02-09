import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAgents, useCreateAgent, useDeleteAgent } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { Bot, Plus, Trash2, ChevronRight, X, Check } from "lucide-react";

interface AgentsPanelProps {
  projectId: string;
}

export function AgentsPanel({ projectId }: AgentsPanelProps) {
  const navigate = useNavigate();
  const { data: agents, isLoading } = useAgents(projectId);
  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    const name = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!name) return;

    try {
      await createAgent.mutateAsync({
        projectId,
        name,
        description: "",
        saveToYaml: true,
      });
      setNewName("");
      setIsCreating(false);
      // Navigate to the new agent page
      navigate({ to: "/projects/$projectId/agents/$agentName", params: { projectId, agentName: name } });
    } catch (err) {
      alert(`Failed to create agent: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleDelete = async (agentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete agent "${agentName}"?`)) return;

    try {
      await deleteAgent.mutateAsync({ projectId, name: agentName });
    } catch (err) {
      alert(`Failed to delete agent: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
    if (e.key === "Escape") { setIsCreating(false); setNewName(""); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 border-b border-border flex items-center justify-between">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Agents
        </div>
        <button
          onClick={() => setIsCreating(true)}
          disabled={createAgent.isPending}
          className={cn(
            "p-0.5 rounded hover:bg-bg-elevated transition-colors",
            "text-text-secondary hover:text-text-primary",
            createAgent.isPending && "opacity-50"
          )}
          title="New Agent"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {/* New agent inline form */}
        {isCreating && (
          <div className="px-3 py-2 flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="agent-name"
              autoFocus
              className={cn(
                "flex-1 px-2 py-1 bg-bg-secondary border border-border rounded text-sm",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent-primary font-mono"
              )}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createAgent.isPending}
              className="p-1 text-accent-primary hover:bg-bg-elevated rounded"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setIsCreating(false); setNewName(""); }}
              className="p-1 text-text-muted hover:bg-bg-elevated rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="px-3 py-2 text-sm text-text-muted">Loading...</div>
        ) : agents && agents.length > 0 ? (
          agents.map((agent) => (
            <div
              key={agent.id}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 group",
                "hover:bg-bg-elevated transition-colors cursor-pointer",
                "text-sm text-text-primary"
              )}
              onClick={() => navigate({ to: "/projects/$projectId/agents/$agentName", params: { projectId, agentName: agent.name } })}
            >
              <Bot className="w-4 h-4 text-accent-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{agent.name}</div>
                {agent.description && (
                  <div className="text-xs text-text-muted truncate">{agent.description}</div>
                )}
              </div>
              {agent.isBuiltin ? (
                <span className="text-xs text-text-muted px-1 bg-bg-elevated rounded shrink-0">built-in</span>
              ) : (
                <button
                  onClick={(e) => handleDelete(agent.name, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-accent-error transition-all"
                  title="Delete agent"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
            </div>
          ))
        ) : (
          <div className="px-3 py-4 text-center">
            <Bot className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <div className="text-sm text-text-muted">No agents yet</div>
            <button
              onClick={() => setIsCreating(true)}
              className="mt-2 text-sm text-accent-primary hover:underline"
            >
              Create your first agent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
