/**
 * Docker Sidebar Panel
 *
 * Shows a list of Docker containers with their status.
 * Allows starting/stopping containers and opening details.
 */

import { useState } from "react";
import {
  Box,
  Play,
  Square,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Plus,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { usePageOpener } from "@/primitives/hooks";
import {
  useDockerContainers,
  useDockerAvailable,
  useStartContainer,
  useStopContainer,
  useRestartContainer,
  type DockerContainer,
} from "../api";

interface ContainerItemProps {
  container: DockerContainer;
  onSelect: () => void;
}

function ContainerItem({ container, onSelect }: ContainerItemProps) {
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();

  const isRunning = container.status === "running";
  const isPending =
    startContainer.isPending || stopContainer.isPending || restartContainer.isPending;

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    startContainer.mutate(container.id, {
      onError: (error) => {
        console.error("Failed to start container:", error);
        alert(`Failed to start container: ${error.message}`);
      },
    });
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopContainer.mutate(container.id, {
      onError: (error) => {
        console.error("Failed to stop container:", error);
        alert(`Failed to stop container: ${error.message}`);
      },
    });
  };

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation();
    restartContainer.mutate(container.id, {
      onError: (error) => {
        console.error("Failed to restart container:", error);
        alert(`Failed to restart container: ${error.message}`);
      },
    });
  };

  // Get primary port if any
  const primaryPort = container.ports.find((p) => p.publicPort);

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded",
        "hover:bg-bg-elevated transition-colors"
      )}
      onClick={onSelect}
    >
      {/* Status indicator */}
      <div
        className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          isRunning ? "bg-accent-success" : "bg-text-muted"
        )}
      />

      {/* Name and port */}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate text-text-primary">{container.name}</div>
        {primaryPort && (
          <div className="text-xs text-text-muted">{primaryPort.publicPort}</div>
        )}
      </div>

      {/* Action buttons */}
      <div className="hidden group-hover:flex items-center gap-1">
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />
        ) : isRunning ? (
          <>
            <button
              onClick={handleStop}
              className="p-1 rounded hover:bg-bg-surface transition-colors text-text-secondary hover:text-text-primary"
              title="Stop"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              onClick={handleRestart}
              className="p-1 rounded hover:bg-bg-surface transition-colors text-text-secondary hover:text-text-primary"
              title="Restart"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        ) : (
          <button
            onClick={handleStart}
            className="p-1 rounded hover:bg-bg-surface transition-colors text-text-secondary hover:text-text-primary"
            title="Start"
          >
            <Play className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

interface ContainerGroupProps {
  title: string;
  containers: DockerContainer[];
  defaultOpen?: boolean;
  onSelectContainer: (container: DockerContainer) => void;
}

function ContainerGroup({
  title,
  containers,
  defaultOpen = true,
  onSelectContainer,
}: ContainerGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (containers.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        className="flex items-center gap-1 w-full px-2 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {title} ({containers.length})
      </button>
      {isOpen && (
        <div>
          {containers.map((container) => (
            <ContainerItem
              key={container.id}
              container={container}
              onSelect={() => onSelectContainer(container)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DockerSidebarPanel() {
  const { data: available, isLoading: availableLoading } = useDockerAvailable();
  const { data: containers, isLoading: containersLoading, error } = useDockerContainers({ all: true });
  const { openPage } = usePageOpener();

  const handleSelectContainer = (container: DockerContainer) => {
    openPage("docker.container", {
      containerId: container.id,
      containerName: container.name,
    });
  };

  const handleNewContainer = () => {
    openPage("docker.new-container", {});
  };

  // Loading state
  if (availableLoading || containersLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  // Docker not available
  if (!available) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="w-8 h-8 text-text-muted mb-2" />
        <div className="text-sm text-text-secondary">Docker is not available</div>
        <div className="text-xs text-text-muted mt-1">
          Make sure Docker is installed and running
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="w-8 h-8 text-accent-error mb-2" />
        <div className="text-sm text-text-secondary">Failed to load containers</div>
        <div className="text-xs text-text-muted mt-1">{error.message}</div>
      </div>
    );
  }

  // Group containers by status
  const runningContainers = containers?.filter((c) => c.status === "running") || [];
  const stoppedContainers = containers?.filter((c) => c.status !== "running") || [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Docker</span>
        </div>
        <button
          onClick={handleNewContainer}
          className="p-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-accent-primary"
          title="New Container"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Container list */}
      <div className="flex-1 overflow-y-auto py-2">
        <ContainerGroup
          title="Running"
          containers={runningContainers}
          onSelectContainer={handleSelectContainer}
        />
        <ContainerGroup
          title="Stopped"
          containers={stoppedContainers}
          defaultOpen={false}
          onSelectContainer={handleSelectContainer}
        />

        {containers?.length === 0 && (
          <div className="px-4 py-8 text-center text-text-muted text-sm">
            No containers found
          </div>
        )}
      </div>

      {/* Footer with images link */}
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={() => openPage("docker.images", {})}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
        >
          <Box className="w-4 h-4" />
          <span>Images</span>
        </button>
      </div>
    </div>
  );
}
