/**
 * Container Detail Page
 *
 * Shows detailed information about a Docker container.
 */

import { useState } from "react";
import {
  Box,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Loader2,
  AlertCircle,
  Terminal,
  Network,
  HardDrive,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { usePageOpener } from "@/primitives/hooks";
import {
  useDockerContainer,
  useStartContainer,
  useStopContainer,
  useRestartContainer,
  useRemoveContainer,
} from "../api";

interface ContainerDetailPageProps {
  params: {
    containerId: string;
    containerName?: string;
  };
}

type Tab = "overview" | "ports" | "volumes" | "env" | "logs";

export function ContainerDetailPage({ params }: ContainerDetailPageProps) {
  const { containerId, containerName } = params;
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { openPage } = usePageOpener();

  const { data: container, isLoading, error } = useDockerContainer(containerId);

  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();
  const removeContainer = useRemoveContainer();

  const isRunning = container?.state?.running;
  const isPending =
    startContainer.isPending ||
    stopContainer.isPending ||
    restartContainer.isPending ||
    removeContainer.isPending;

  const handleStart = () => {
    startContainer.mutate(containerId, {
      onError: (error) => {
        console.error("Failed to start container:", error);
        alert(`Failed to start container: ${error.message}`);
      },
    });
  };

  const handleStop = () => {
    stopContainer.mutate(containerId, {
      onError: (error) => {
        console.error("Failed to stop container:", error);
        alert(`Failed to stop container: ${error.message}`);
      },
    });
  };

  const handleRestart = () => {
    restartContainer.mutate(containerId, {
      onError: (error) => {
        console.error("Failed to restart container:", error);
        alert(`Failed to restart container: ${error.message}`);
      },
    });
  };

  const handleRemove = () => {
    if (!confirm(`Are you sure you want to remove container "${container?.name || containerId}"?`)) {
      return;
    }
    removeContainer.mutate(
      { containerId, force: true },
      {
        onSuccess: () => {
          // Navigate away after deletion
          window.history.back();
        },
        onError: (error) => {
          console.error("Failed to remove container:", error);
          alert(`Failed to remove container: ${error.message}`);
        },
      }
    );
  };

  const handleViewLogs = () => {
    openPage("docker.logs", {
      containerId,
      containerName: container?.name || containerName,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !container) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-8 h-8 text-accent-error mb-2" />
        <div className="text-text-secondary">Failed to load container</div>
        <div className="text-sm text-text-muted mt-1">{error?.message || "Container not found"}</div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof Box }[] = [
    { id: "overview", label: "Overview", icon: Box },
    { id: "ports", label: "Ports", icon: Network },
    { id: "volumes", label: "Volumes", icon: HardDrive },
    { id: "env", label: "Environment", icon: Settings },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Box className="w-5 h-5 text-accent-primary" />
          <div>
            <h1 className="text-lg font-medium text-text-primary">{container.name}</h1>
            <div className="text-xs text-text-muted">{container.image}</div>
          </div>
          <div
            className={cn(
              "px-2 py-0.5 rounded-full text-xs",
              isRunning
                ? "bg-accent-success/20 text-accent-success"
                : "bg-bg-elevated text-text-secondary"
            )}
          >
            {container.state.status}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
          ) : (
            <>
              {isRunning ? (
                <>
                  <button
                    onClick={handleStop}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
                      "bg-bg-elevated hover:bg-bg-surface text-text-primary transition-colors"
                    )}
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop
                  </button>
                  <button
                    onClick={handleRestart}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
                      "bg-bg-elevated hover:bg-bg-surface text-text-primary transition-colors"
                    )}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStart}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
                    "bg-accent-success text-white hover:bg-accent-success/90 transition-colors"
                  )}
                >
                  <Play className="w-3.5 h-3.5" />
                  Start
                </button>
              )}
              <button
                onClick={handleViewLogs}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
                  "bg-bg-elevated hover:bg-bg-surface text-text-primary transition-colors"
                )}
              >
                <Terminal className="w-3.5 h-3.5" />
                Logs
              </button>
              <button
                onClick={handleRemove}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
                  "bg-bg-elevated hover:bg-accent-error text-accent-error hover:text-white transition-colors"
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-accent-primary text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <InfoRow label="Container ID" value={container.id} />
            <InfoRow label="Image" value={container.image} />
            <InfoRow label="Created" value={new Date(container.created).toLocaleString()} />
            <InfoRow label="Status" value={container.state.status} />
            {container.state.running && (
              <InfoRow label="Started At" value={new Date(container.state.startedAt).toLocaleString()} />
            )}
            {container.state.exitCode !== 0 && !container.state.running && (
              <InfoRow label="Exit Code" value={String(container.state.exitCode)} />
            )}
            {container.cmd && (
              <InfoRow label="Command" value={container.cmd.join(" ")} />
            )}
            {container.restartPolicy && (
              <InfoRow label="Restart Policy" value={container.restartPolicy.Name} />
            )}
          </div>
        )}

        {activeTab === "ports" && (
          <div className="space-y-2">
            {container.ports.length === 0 ? (
              <div className="text-text-muted">No port mappings</div>
            ) : (
              container.ports.map((port, i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b border-border">
                  <div className="text-sm">
                    <span className="text-text-secondary">{port.containerPort}</span>
                    <span className="text-text-muted mx-2">→</span>
                    {port.hostBindings.map((binding, j) => (
                      <span key={j} className="text-text-primary">
                        {binding.HostIp || "0.0.0.0"}:{binding.HostPort}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "volumes" && (
          <div className="space-y-2">
            {container.mounts.length === 0 ? (
              <div className="text-text-muted">No volume mounts</div>
            ) : (
              container.mounts.map((mount, i) => (
                <div key={i} className="py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-xs",
                      mount.Type === "bind" ? "bg-accent-primary/20 text-accent-primary" : "bg-accent-primary/20 text-accent-primary"
                    )}>
                      {mount.Type}
                    </span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-xs",
                      mount.RW ? "bg-accent-success/20 text-accent-success" : "bg-accent-warning/20 text-accent-warning"
                    )}>
                      {mount.RW ? "rw" : "ro"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="text-text-secondary">{mount.Source}</span>
                    <span className="text-text-muted mx-2">→</span>
                    <span className="text-text-primary">{mount.Destination}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "env" && (
          <div className="space-y-1">
            {container.env.length === 0 ? (
              <div className="text-text-muted">No environment variables</div>
            ) : (
              container.env.map((env, i) => {
                const [key, ...valueParts] = env.split("=");
                const value = valueParts.join("=");
                return (
                  <div key={i} className="flex flex-col sm:flex-row py-1.5 border-b border-border text-sm font-mono gap-1 sm:gap-0">
                    <span className="text-accent-primary sm:min-w-[200px] shrink-0 break-all">{key}</span>
                    <span className="text-text-primary break-all">{value}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <div className="w-32 text-text-muted text-sm">{label}</div>
      <div className="text-sm font-mono text-text-primary">{value}</div>
    </div>
  );
}
