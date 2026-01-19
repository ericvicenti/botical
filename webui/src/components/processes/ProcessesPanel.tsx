import { useState } from "react";
import { SpawnProcessForm } from "./SpawnProcessForm";
import { ProcessList } from "./ProcessList";
import { ServiceList } from "./ServiceList";
import { cn } from "@/lib/utils/cn";

interface ProcessesPanelProps {
  projectId: string;
}

type Tab = "commands" | "services";

export function ProcessesPanel({ projectId }: ProcessesPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("commands");

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("commands")}
            className={cn(
              "text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded transition-colors",
              activeTab === "commands"
                ? "text-text-primary bg-bg-elevated"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            Commands
          </button>
          <button
            onClick={() => setActiveTab("services")}
            className={cn(
              "text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded transition-colors",
              activeTab === "services"
                ? "text-text-primary bg-bg-elevated"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            Services
          </button>
        </div>
      </div>
      {activeTab === "commands" && (
        <>
          <div className="p-2 border-b border-border">
            <SpawnProcessForm projectId={projectId} />
          </div>
          <div className="flex-1 overflow-auto py-1">
            <ProcessList projectId={projectId} />
          </div>
        </>
      )}
      {activeTab === "services" && (
        <div className="flex-1 overflow-auto py-1">
          <ServiceList projectId={projectId} />
        </div>
      )}
    </div>
  );
}
