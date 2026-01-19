import { cn } from "@/lib/utils/cn";
import {
  useStartService,
  useStopService,
  useRestartService,
  useDeleteService,
  useUpdateService,
} from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";
import { truncateCommand } from "@/lib/tabs";
import type { Service } from "@/lib/api/types";
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  Zap,
  Radio,
} from "lucide-react";
import { useState } from "react";

function handleMutationError(action: string, error: Error) {
  console.error(`Failed to ${action}:`, error);
  alert(`Failed to ${action}: ${error.message}`);
}

interface ServiceItemProps {
  service: Service;
}

export function ServiceItem({ service }: ServiceItemProps) {
  const [showActions, setShowActions] = useState(false);
  const { openTab } = useTabs();
  const navigate = useNavigate();
  const startService = useStartService();
  const stopService = useStopService();
  const restartService = useRestartService();
  const deleteService = useDeleteService();
  const updateService = useUpdateService();

  const isLoading =
    startService.isPending ||
    stopService.isPending ||
    restartService.isPending ||
    deleteService.isPending ||
    updateService.isPending;

  const openProcessTab = (processId: string) => {
    openTab({
      type: "process",
      processId,
      projectId: service.projectId,
      label: service.name,
    });
    navigate({ to: "/processes/$processId", params: { processId } });
  };

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    startService.mutate(
      { serviceId: service.id },
      {
        onSuccess: (data) => {
          if (data.processId) {
            openProcessTab(data.processId);
          }
        },
        onError: (error) => handleMutationError("start service", error),
      }
    );
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopService.mutate(
      { serviceId: service.id },
      {
        onError: (error) => handleMutationError("stop service", error),
      }
    );
  };

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation();
    restartService.mutate(
      { serviceId: service.id },
      {
        onSuccess: (data) => {
          if (data.processId) {
            openProcessTab(data.processId);
          }
        },
        onError: (error) => handleMutationError("restart service", error),
      }
    );
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete service "${service.name}"?`)) {
      deleteService.mutate(
        { serviceId: service.id },
        {
          onError: (error) => handleMutationError("delete service", error),
        }
      );
    }
  };

  const handleToggleAutoStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateService.mutate(
      {
        serviceId: service.id,
        autoStart: !service.autoStart,
      },
      {
        onError: (error) => handleMutationError("update service", error),
      }
    );
  };

  const handleViewProcess = () => {
    if (service.runningProcessId) {
      openProcessTab(service.runningProcessId);
    }
  };

  const displayCommand = truncateCommand(service.command);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 px-2 py-1.5",
        "hover:bg-bg-elevated transition-colors rounded",
        "text-sm cursor-pointer",
        service.isRunning && "bg-bg-elevated/50"
      )}
      onClick={service.isRunning ? handleViewProcess : undefined}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <Radio
        className={cn(
          "w-3.5 h-3.5 shrink-0",
          service.isRunning ? "text-accent-success" : "text-text-muted"
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate font-medium",
              service.isRunning ? "text-text-primary" : "text-text-secondary"
            )}
          >
            {service.name}
          </span>
          {service.autoStart && (
            <span title="Auto-start enabled">
              <Zap className="w-3 h-3 text-accent-warning shrink-0" />
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted truncate" title={service.command}>
          {displayCommand}
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          "flex items-center gap-1 shrink-0 transition-opacity",
          showActions || isLoading ? "opacity-100" : "opacity-0"
        )}
      >
        {service.isRunning ? (
          <>
            <button
              onClick={handleRestart}
              disabled={isLoading}
              className={cn(
                "p-1 rounded hover:bg-bg-surface transition-colors",
                "text-text-muted hover:text-accent-primary",
                isLoading && "opacity-50"
              )}
              title="Restart service"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleStop}
              disabled={isLoading}
              className={cn(
                "p-1 rounded hover:bg-accent-error/20 transition-colors",
                "text-text-muted hover:text-accent-error",
                isLoading && "opacity-50"
              )}
              title="Stop service"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleStart}
              disabled={isLoading}
              className={cn(
                "p-1 rounded hover:bg-accent-success/20 transition-colors",
                "text-text-muted hover:text-accent-success",
                isLoading && "opacity-50"
              )}
              title="Start service"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToggleAutoStart}
              disabled={isLoading}
              className={cn(
                "p-1 rounded hover:bg-bg-surface transition-colors",
                service.autoStart
                  ? "text-accent-warning"
                  : "text-text-muted hover:text-accent-warning",
                isLoading && "opacity-50"
              )}
              title={service.autoStart ? "Disable auto-start" : "Enable auto-start"}
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className={cn(
                "p-1 rounded hover:bg-accent-error/20 transition-colors",
                "text-text-muted hover:text-accent-error",
                isLoading && "opacity-50"
              )}
              title="Delete service"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Running indicator */}
      {service.isRunning && (
        <div className="absolute right-0 top-0 bottom-0 w-1 bg-accent-success rounded-r" />
      )}
    </div>
  );
}
