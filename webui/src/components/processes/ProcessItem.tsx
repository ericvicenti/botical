import { cn } from "@/lib/utils/cn";
import { useKillProcess } from "@/lib/api/queries";
import type { Process } from "@/lib/api/types";
import { Square, Terminal, Radio, Clock, AlertCircle, CheckCircle, XCircle } from "lucide-react";

interface ProcessItemProps {
  process: Process;
  isSelected: boolean;
  onSelect: () => void;
}

export function ProcessItem({ process, isSelected, onSelect }: ProcessItemProps) {
  const killProcess = useKillProcess();
  const isRunning = process.status === "running" || process.status === "starting";

  const handleKill = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning) {
      killProcess.mutate({ processId: process.id });
    }
  };

  const getStatusIcon = () => {
    switch (process.status) {
      case "running":
      case "starting":
        return <Clock className="w-3 h-3 text-accent-success animate-pulse" />;
      case "completed":
        return <CheckCircle className="w-3 h-3 text-text-muted" />;
      case "failed":
        return <XCircle className="w-3 h-3 text-accent-error" />;
      case "killed":
        return <AlertCircle className="w-3 h-3 text-accent-warning" />;
      default:
        return null;
    }
  };

  const getTypeIcon = () => {
    return process.type === "service" ? (
      <Radio className="w-3.5 h-3.5 text-accent-primary" />
    ) : (
      <Terminal className="w-3.5 h-3.5 text-text-secondary" />
    );
  };

  const formatRuntime = () => {
    const start = process.startedAt;
    const end = process.endedAt || Date.now();
    const duration = end - start;

    if (duration < 1000) return "<1s";
    if (duration < 60000) return `${Math.floor(duration / 1000)}s`;
    if (duration < 3600000) return `${Math.floor(duration / 60000)}m`;
    return `${Math.floor(duration / 3600000)}h`;
  };

  // Truncate command for display
  const displayCommand =
    process.command.length > 40
      ? process.command.substring(0, 37) + "..."
      : process.command;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 text-left",
        "hover:bg-bg-elevated transition-colors rounded",
        "text-sm",
        isSelected && "bg-bg-elevated"
      )}
    >
      {getTypeIcon()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {getStatusIcon()}
          <span
            className={cn(
              "truncate",
              isRunning ? "text-text-primary" : "text-text-secondary"
            )}
            title={process.command}
          >
            {process.label || displayCommand}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-text-muted">{formatRuntime()}</span>
        {isRunning && (
          <button
            onClick={handleKill}
            disabled={killProcess.isPending}
            className={cn(
              "p-0.5 rounded hover:bg-accent-error/20 transition-colors",
              "text-text-muted hover:text-accent-error",
              killProcess.isPending && "opacity-50"
            )}
            title="Stop process"
          >
            <Square className="w-3 h-3" />
          </button>
        )}
      </div>
    </button>
  );
}
