import { useState } from "react";
import { useSpawnProcess, useSettings } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";
import { Play, ChevronDown } from "lucide-react";

interface SpawnProcessFormProps {
  projectId: string;
}

export function SpawnProcessForm({ projectId }: SpawnProcessFormProps) {
  const [command, setCommand] = useState("");
  const [label, setLabel] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const spawnProcess = useSpawnProcess();
  const { data: settings } = useSettings();
  const { openTab } = useTabs();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    try {
      const process = await spawnProcess.mutateAsync({
        projectId,
        type: "command",
        command: command.trim(),
        scope: "project",
        scopeId: projectId,
        label: label.trim() || undefined,
        createdBy: settings?.userId || "user",
      });

      // Open the new process in a tab
      openTab({
        type: "process",
        processId: process.id,
        projectId,
        label: label.trim() || command.slice(0, 30),
      });
      navigate({ to: "/projects/$projectId/processes/$processId", params: { projectId, processId: process.id } });

      // Clear form
      setCommand("");
      setLabel("");
      setShowAdvanced(false);
    } catch (error) {
      console.error("Failed to spawn process:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-1">
        <div className="flex-1">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter command..."
            className={cn(
              "w-full px-2 py-1.5 text-sm rounded",
              "bg-bg-primary border border-border",
              "focus:outline-none focus:border-accent-primary",
              "placeholder:text-text-muted"
            )}
          />
        </div>
        <button
          type="submit"
          disabled={!command.trim() || spawnProcess.isPending}
          className={cn(
            "px-2 py-1.5 rounded",
            "bg-accent-primary text-white",
            "hover:bg-accent-primary/80 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "flex items-center gap-1"
          )}
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(
            "flex items-center gap-0.5 text-xs text-text-muted",
            "hover:text-text-secondary transition-colors"
          )}
        >
          <span>Options</span>
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform",
              showAdvanced && "rotate-180"
            )}
          />
        </button>
      </div>

      {showAdvanced && (
        <div className="pt-1">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className={cn(
              "w-full px-2 py-1 text-sm rounded",
              "bg-bg-primary border border-border",
              "focus:outline-none focus:border-accent-primary",
              "placeholder:text-text-muted"
            )}
          />
        </div>
      )}

      {spawnProcess.isError && (
        <div className="text-xs text-accent-error">
          Failed to start process. Please try again.
        </div>
      )}
    </form>
  );
}
