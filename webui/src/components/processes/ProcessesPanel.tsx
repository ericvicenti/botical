import { SpawnProcessForm } from "./SpawnProcessForm";
import { ProcessList } from "./ProcessList";

interface ProcessesPanelProps {
  projectId: string;
}

export function ProcessesPanel({ projectId }: ProcessesPanelProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 border-b border-border">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Commands & Services
        </div>
      </div>
      <div className="p-2 border-b border-border">
        <SpawnProcessForm projectId={projectId} />
      </div>
      <div className="flex-1 overflow-auto py-1">
        <ProcessList projectId={projectId} />
      </div>
    </div>
  );
}
