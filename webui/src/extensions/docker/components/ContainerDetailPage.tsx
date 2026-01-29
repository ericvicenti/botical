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
import { cn } from "@/lib/utils";
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
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !container) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
        <div className="text-zinc-400">Failed to load container</div>
        <div className="text-sm text-zinc-500 mt-1">{error?.message || "Container not found"}</div>
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Box className="w-5 h-5 text-blue-400" />
          <div>
            <h1 className="text-lg font-medium">{container.name}</h1>
            <div className="text-xs text-zinc-500">{container.image}</div>
          </div>
          <div
            className={cn(
              "px-2 py-0.5 rounded-full text-xs",
              isRunning
                ? "bg-green-500/20 text-green-400"
                : "bg-zinc-700 text-zinc-400"
            )}
          >
            {container.state.status}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              {isRunning ? (
                <>
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop
                  </button>
                  <button
                    onClick={handleRestart}
                    className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start
                </button>
              )}
              <button
                onClick={handleViewLogs}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
              >
                <Terminal className="w-3.5 h-3.5" />
                Logs
              </button>
              <button
                onClick={handleRemove}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-red-600 text-sm text-red-400 hover:text-white"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-blue-500 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
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
              <div className="text-zinc-500">No port mappings</div>
            ) : (
              container.ports.map((port, i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b border-zinc-800">
                  <div className="text-sm">
                    <span className="text-zinc-400">{port.containerPort}</span>
                    <span className="text-zinc-500 mx-2">→</span>
                    {port.hostBindings.map((binding, j) => (
                      <span key={j} className="text-white">
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
              <div className="text-zinc-500">No volume mounts</div>
            ) : (
              container.mounts.map((mount, i) => (
                <div key={i} className="py-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-xs",
                      mount.Type === "bind" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                    )}>
                      {mount.Type}
                    </span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-xs",
                      mount.RW ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                    )}>
                      {mount.RW ? "rw" : "ro"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="text-zinc-400">{mount.Source}</span>
                    <span className="text-zinc-500 mx-2">→</span>
                    <span className="text-white">{mount.Destination}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "env" && (
          <div className="space-y-1">
            {container.env.length === 0 ? (
              <div className="text-zinc-500">No environment variables</div>
            ) : (
              container.env.map((env, i) => {
                const [key, ...valueParts] = env.split("=");
                const value = valueParts.join("=");
                return (
                  <div key={i} className="flex py-1.5 border-b border-zinc-800 text-sm font-mono">
                    <span className="text-blue-400 min-w-[200px]">{key}</span>
                    <span className="text-zinc-300 break-all">{value}</span>
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
      <div className="w-32 text-zinc-500 text-sm">{label}</div>
      <div className="text-sm font-mono">{value}</div>
    </div>
  );
}
