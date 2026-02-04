/**
 * ExtensionDetailView Component
 *
 * Shows detailed information about a selected extension including:
 * - Server status (running, stopped, error)
 * - Port information
 * - Extension actions (from the action registry)
 * - Service controls (start/stop)
 */

import { useState } from "react";
import {
  ArrowLeft,
  Server,
  Play,
  Square,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Extension } from "@/lib/api/types";
import { useSearchStatus, useProvisionSearch, useStopSearch } from "@/extensions/search/api";
import { useActions, useExecuteAction } from "@/lib/api/actions";

interface ExtensionDetailViewProps {
  extension: Extension;
  enabled: boolean;
  onBack: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    running: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10", label: "Running" },
    stopped: { icon: XCircle, color: "text-zinc-500", bg: "bg-zinc-500/10", label: "Stopped" },
    starting: { icon: Loader2, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Starting", spin: true },
    error: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Error" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.stopped;
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs", config.bg, config.color)}>
      <Icon className={cn("w-3 h-3", config.spin && "animate-spin")} />
      <span>{config.label}</span>
    </div>
  );
}

/**
 * Search extension service management (SearXNG Docker container)
 */
function SearchServiceDetail({ enabled }: { enabled: boolean }) {
  const { data: status, isLoading, refetch } = useSearchStatus();
  const provisionMutation = useProvisionSearch();
  const stopMutation = useStopSearch();

  const handleProvision = async () => {
    try {
      await provisionMutation.mutateAsync();
    } catch (err) {
      console.error("Provision failed:", err);
    }
  };

  const handleStop = async () => {
    try {
      await stopMutation.mutateAsync();
    } catch (err) {
      console.error("Stop failed:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-bg-elevated border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-text-secondary uppercase">SearXNG Service</div>
        <button
          onClick={() => refetch()}
          className="p-1 rounded hover:bg-bg-primary text-text-secondary"
          title="Refresh status"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Status:</span>
          <span className={cn("text-sm font-medium", status?.available ? "text-green-500" : "text-text-muted")}>
            {status?.containerRunning ? "Running" : status?.containerExists ? "Stopped" : "Not created"}
          </span>
        </div>
        {status?.error && (
          <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
            <div className="text-xs text-red-500">{status.error}</div>
          </div>
        )}
      </div>

      {/* Service controls */}
      <div className="flex gap-2 mt-3">
        {!status?.containerRunning && (
          <button
            onClick={handleProvision}
            disabled={provisionMutation.isPending || !enabled}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm",
              "bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {provisionMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Start
          </button>
        )}
        {status?.containerRunning && (
          <button
            onClick={handleStop}
            disabled={stopMutation.isPending}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm",
              "bg-red-500/20 text-red-500 hover:bg-red-500/30",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {stopMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            Stop
          </button>
        )}
      </div>
      {!enabled && (
        <div className="mt-2 text-xs text-text-muted">
          Enable this extension to manage the service
        </div>
      )}
      {provisionMutation.error && (
        <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
          <div className="text-xs text-red-500">
            {provisionMutation.error instanceof Error ? provisionMutation.error.message : "Failed to start"}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Extension actions list - shows actions provided by this extension
 */
function ExtensionActions({ extensionId, enabled }: { extensionId: string; enabled: boolean }) {
  const { data: actions, isLoading } = useActions();
  const executeAction = useExecuteAction();
  const [lastResult, setLastResult] = useState<{ actionId: string; message: string; type: "success" | "error" } | null>(null);

  // Filter actions that belong to this extension (by category matching extension id)
  const extensionActions = actions?.filter((action) => action.category === extensionId) || [];

  const handleExecuteAction = async (actionId: string, label: string) => {
    // For actions that need parameters, we'd normally open a dialog
    // For now, actions without required params can be executed directly
    try {
      const result = await executeAction.mutateAsync({
        actionId,
        params: {},
      });
      if (result.type === "error") {
        setLastResult({ actionId, message: result.message || "Action failed", type: "error" });
      } else {
        setLastResult({ actionId, message: result.title || result.output || "Action completed", type: "success" });
      }
    } catch (err) {
      setLastResult({
        actionId,
        message: err instanceof Error ? err.message : "Action failed",
        type: "error"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
      </div>
    );
  }

  if (extensionActions.length === 0) {
    return null;
  }

  return (
    <div className="p-3 rounded-lg bg-bg-elevated border border-border">
      <div className="text-xs font-medium text-text-secondary uppercase mb-2">Actions</div>
      <div className="space-y-1">
        {extensionActions.map((action) => {
          // Check if action has required params (excluding projectId which is auto-filled)
          const hasRequiredParams = action.params.some(
            (p) => p.required && p.name !== "projectId"
          );

          return (
            <button
              key={action.id}
              onClick={() => !hasRequiredParams && handleExecuteAction(action.id, action.label)}
              disabled={!enabled || executeAction.isPending || hasRequiredParams}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left",
                "hover:bg-bg-primary transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                !hasRequiredParams && "cursor-pointer"
              )}
              title={hasRequiredParams ? "Use command palette (Cmd+K) to provide parameters" : action.description}
            >
              <Zap className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary">{action.label}</div>
                <div className="text-xs text-text-muted truncate">{action.description}</div>
              </div>
              {hasRequiredParams && (
                <span className="text-xs text-text-muted">Cmd+K</span>
              )}
            </button>
          );
        })}
      </div>
      {lastResult && (
        <div className={cn(
          "mt-2 p-2 rounded text-xs",
          lastResult.type === "error"
            ? "bg-red-500/10 border border-red-500/20 text-red-500"
            : "bg-green-500/10 border border-green-500/20 text-green-500"
        )}>
          {lastResult.message}
        </div>
      )}
      {!enabled && (
        <div className="mt-2 text-xs text-text-muted">
          Enable this extension to use actions
        </div>
      )}
    </div>
  );
}

export function ExtensionDetailView({ extension, enabled, onBack }: ExtensionDetailViewProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-2 py-1 border-b border-border flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-bg-elevated text-text-secondary"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          {extension.name}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Status & Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-text-secondary" />
              <span className="text-sm text-text-primary">Server</span>
            </div>
            <StatusBadge status={extension.status} />
          </div>

          {extension.port && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Port</span>
              <span className="text-sm font-mono text-text-primary">{extension.port}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Version</span>
            <span className="text-sm text-text-primary">{extension.version}</span>
          </div>
        </div>

        {/* Description */}
        <div className="p-3 rounded-lg bg-bg-elevated border border-border">
          <div className="text-xs text-text-muted">{extension.description}</div>
        </div>

        {/* Extension Actions */}
        <ExtensionActions extensionId={extension.id} enabled={enabled} />

        {/* Extension-specific service management */}
        {extension.id === "search" && (
          <SearchServiceDetail enabled={enabled} />
        )}
      </div>
    </div>
  );
}
