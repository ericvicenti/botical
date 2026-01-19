import { createFileRoute } from "@tanstack/react-router";
import { useProcess } from "@/lib/api/queries";
import { useUI } from "@/contexts/ui";
import { ProcessTerminal } from "@/components/processes/ProcessTerminal";
import { cn } from "@/lib/utils/cn";
import { Terminal, Square, Radio } from "lucide-react";
import { useKillProcess } from "@/lib/api/queries";

export const Route = createFileRoute("/processes/$processId")({
  component: ProcessView,
});

function ProcessView() {
  const { processId } = Route.useParams();
  const { selectedProjectId } = useUI();
  const { data: process, isLoading } = useProcess(processId);
  const killProcess = useKillProcess();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading process...
      </div>
    );
  }

  if (!process) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Process not found
      </div>
    );
  }

  const isRunning = process.status === "running" || process.status === "starting";

  const handleKill = () => {
    if (isRunning) {
      killProcess.mutate({ processId: process.id });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Process header */}
      <div className="h-10 px-4 border-b border-border flex items-center justify-between shrink-0 bg-bg-secondary">
        <div className="flex items-center gap-3 min-w-0">
          {process.type === "service" ? (
            <Radio className="w-4 h-4 text-accent-primary shrink-0" />
          ) : (
            <Terminal className="w-4 h-4 text-text-secondary shrink-0" />
          )}
          <span className="text-sm font-medium text-text-primary truncate">
            {process.label || process.command}
          </span>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded shrink-0",
              isRunning
                ? "bg-accent-success/20 text-accent-success"
                : process.status === "completed"
                  ? "bg-bg-elevated text-text-muted"
                  : "bg-accent-error/20 text-accent-error"
            )}
          >
            {process.status}
          </span>
          {process.exitCode !== null && (
            <span className="text-xs text-text-muted">
              Exit code: {process.exitCode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={handleKill}
              disabled={killProcess.isPending}
              className={cn(
                "px-3 py-1 text-sm rounded flex items-center gap-1.5",
                "bg-accent-error/10 text-accent-error hover:bg-accent-error/20",
                "transition-colors",
                killProcess.isPending && "opacity-50"
              )}
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 min-h-0">
        <ProcessTerminal
          processId={processId}
          projectId={selectedProjectId || process.projectId}
        />
      </div>
    </div>
  );
}
