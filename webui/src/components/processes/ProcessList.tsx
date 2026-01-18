import { useProcesses } from "@/lib/api/queries";
import { useUI } from "@/contexts/ui";
import { ProcessItem } from "./ProcessItem";
import { Terminal } from "lucide-react";

interface ProcessListProps {
  projectId: string;
}

export function ProcessList({ projectId }: ProcessListProps) {
  const { data: processes, isLoading } = useProcesses(projectId);
  const { selectedProcessId, setSelectedProcess } = useUI();

  if (isLoading) {
    return (
      <div className="py-2 text-sm text-text-muted text-center">
        Loading processes...
      </div>
    );
  }

  if (!processes || processes.length === 0) {
    return (
      <div className="py-4 text-center">
        <Terminal className="w-6 h-6 mx-auto text-text-muted mb-2" />
        <div className="text-sm text-text-muted">No processes</div>
        <div className="text-xs text-text-muted mt-1">
          Run a command to get started
        </div>
      </div>
    );
  }

  // Split into running and completed processes
  const running = processes.filter(
    (p) => p.status === "running" || p.status === "starting"
  );
  const completed = processes.filter(
    (p) => p.status !== "running" && p.status !== "starting"
  );

  return (
    <div className="space-y-2">
      {running.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs text-text-muted uppercase tracking-wide">
            Running ({running.length})
          </div>
          <div>
            {running.map((process) => (
              <ProcessItem
                key={process.id}
                process={process}
                isSelected={selectedProcessId === process.id}
                onSelect={() => setSelectedProcess(process.id)}
              />
            ))}
          </div>
        </div>
      )}
      {completed.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs text-text-muted uppercase tracking-wide">
            Recent ({completed.length})
          </div>
          <div>
            {completed.slice(0, 10).map((process) => (
              <ProcessItem
                key={process.id}
                process={process}
                isSelected={selectedProcessId === process.id}
                onSelect={() => setSelectedProcess(process.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
