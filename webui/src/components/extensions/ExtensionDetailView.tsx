/**
 * ExtensionDetailView Component
 *
 * Shows detailed information about a selected extension including:
 * - Server status (running, stopped, error)
 * - Port information
 * - Pages/routes available
 * - Action buttons (for extension-specific actions)
 * - Recent activity/diagnostics
 */

import { useState } from "react";
import {
  ArrowLeft,
  Server,
  Play,
  Square,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Globe,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Extension } from "@/lib/api/types";
import { useSearchStatus, useProvisionSearch, useStopSearch } from "@/extensions/search/api";

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

function SearchExtensionDetail({ extension, enabled }: { extension: Extension; enabled: boolean }) {
  const { data: status, isLoading, refetch } = useSearchStatus();
  const provisionMutation = useProvisionSearch();
  const stopMutation = useStopSearch();
  const [showProvisionOutput, setShowProvisionOutput] = useState(false);

  const handleProvision = async () => {
    setShowProvisionOutput(true);
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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* SearXNG Status */}
      <div className="p-3 rounded-lg bg-bg-elevated border border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-text-secondary uppercase">SearXNG Engine</div>
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
            <span className="text-sm text-text-secondary">Available:</span>
            <span className={cn("text-sm font-medium", status?.available ? "text-green-500" : "text-red-500")}>
              {status?.available ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Container:</span>
            <span className="text-sm font-medium">
              {status?.containerRunning ? "Running" : status?.containerExists ? "Stopped" : "Not created"}
            </span>
          </div>
          {status?.containerId && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Container ID:</span>
              <span className="text-sm font-mono text-text-muted">{status.containerId.slice(0, 12)}</span>
            </div>
          )}
          {status?.error && (
            <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
              <div className="text-xs text-red-500">{status.error}</div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 rounded-lg bg-bg-elevated border border-border">
        <div className="text-xs font-medium text-text-secondary uppercase mb-2">Actions</div>
        <div className="flex flex-wrap gap-2">
          {!status?.available && (
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
              Start SearXNG
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
              Stop SearXNG
            </button>
          )}
        </div>
        {!enabled && (
          <div className="mt-2 text-xs text-text-muted">
            Enable this extension to use SearXNG actions
          </div>
        )}
      </div>

      {/* Provision Output */}
      {showProvisionOutput && provisionMutation.error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="text-xs font-medium text-red-500 mb-1">Provisioning Error</div>
          <div className="text-xs text-red-400 font-mono">
            {provisionMutation.error instanceof Error ? provisionMutation.error.message : "Unknown error"}
          </div>
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
        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-text-secondary" />
            <span className="text-sm text-text-primary">Server Status</span>
          </div>
          <StatusBadge status={extension.status} />
        </div>

        {/* Port */}
        {extension.port && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Port</span>
            <span className="text-sm font-mono text-text-primary">{extension.port}</span>
          </div>
        )}

        {/* Version */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Version</span>
          <span className="text-sm text-text-primary">{extension.version}</span>
        </div>

        {/* Category */}
        {extension.category && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Category</span>
            <span className="text-sm text-text-primary capitalize">{extension.category}</span>
          </div>
        )}

        {/* Description */}
        <div className="p-3 rounded-lg bg-bg-elevated border border-border">
          <div className="text-xs text-text-muted">{extension.description}</div>
        </div>

        {/* Routes */}
        {extension.frontend?.routes && extension.frontend.routes.length > 0 && (
          <div className="p-3 rounded-lg bg-bg-elevated border border-border">
            <div className="text-xs font-medium text-text-secondary uppercase mb-2">Routes</div>
            <div className="space-y-1">
              {extension.frontend.routes.map((route) => (
                <div key={route} className="flex items-center gap-2 text-sm">
                  <Globe className="w-3 h-3 text-text-muted" />
                  <code className="text-text-primary">{route}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sidebar Panel */}
        {extension.frontend?.sidebar && (
          <div className="p-3 rounded-lg bg-bg-elevated border border-border">
            <div className="text-xs font-medium text-text-secondary uppercase mb-2">Sidebar Panel</div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary">Label:</span>
              <span className="text-text-primary">{extension.frontend.sidebar.label}</span>
            </div>
          </div>
        )}

        {/* Extension-specific details */}
        {extension.id === "search" && (
          <SearchExtensionDetail extension={extension} enabled={enabled} />
        )}

        {/* Health Check Link */}
        {extension.status === "running" && extension.port && (
          <div className="p-3 rounded-lg bg-bg-elevated border border-border">
            <div className="text-xs font-medium text-text-secondary uppercase mb-2">Quick Links</div>
            <a
              href={`http://localhost:${extension.port}/health`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-accent-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Health Check Endpoint
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
