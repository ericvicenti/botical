import { GitBranch, AlertCircle, RefreshCw, CloudOff, AlertTriangle, ArrowUp, ArrowDown, Loader2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useGitStatus, useGitSyncStatus, useGitSync, useAbortRebase } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { BranchPicker } from "./BranchPicker";
import { UncommittedChanges } from "./UncommittedChanges";
import { CommitList } from "./CommitList";
import { cn } from "@/lib/utils/cn";
import { useEffect } from "react";

interface GitPanelProps {
  projectId: string;
}

export function GitPanel({ projectId }: GitPanelProps) {
  const { data: status, isLoading, error } = useGitStatus(projectId);
  const { data: syncStatus } = useGitSyncStatus(projectId);
  const syncMutation = useGitSync();
  const abortRebaseMutation = useAbortRebase();
  const { openPreviewTab } = useTabs();
  const navigate = useNavigate();

  // Auto-sync on mount and periodically (fetch happens in the hook)
  useEffect(() => {
    if (syncStatus?.hasRemote && syncStatus.state === "idle") {
      // Trigger initial sync to fetch latest
      syncMutation.mutate({ projectId });
    }
  }, [projectId]); // Only on mount

  const handleCommitClick = () => {
    openPreviewTab({
      type: "review-commit",
      projectId,
    });
    navigate({ to: "/projects/$projectId/commit", params: { projectId } });
  };

  const handleSyncClick = () => {
    syncMutation.mutate({ projectId });
  };

  const handleAbortRebase = () => {
    abortRebaseMutation.mutate({ projectId });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        <div className="text-sm">Loading git status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-text-secondary">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div className="text-sm text-center">Failed to load git status</div>
      </div>
    );
  }

  if (!status?.isRepo) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4">
        <GitBranch className="w-10 h-10 text-text-secondary" />
        <div className="text-sm text-text-secondary text-center">
          This project is not a git repository
        </div>
      </div>
    );
  }

  const isSyncing = syncMutation.isPending;
  const isInConflict = syncStatus?.state === "conflict";
  const hasError = syncStatus?.state === "error";
  const hasRemote = syncStatus?.hasRemote ?? false;

  return (
    <div className="h-full flex flex-col">
      {/* Conflict Banner */}
      {isInConflict && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            Rebase conflict
          </div>
          <div className="text-xs mt-1 text-red-500/80">
            {syncStatus?.conflictedFiles?.length || 0} file(s) need resolution
          </div>
          <button
            onClick={handleAbortRebase}
            disabled={abortRebaseMutation.isPending}
            className="mt-2 text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 rounded flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Abort Rebase
          </button>
        </div>
      )}

      {/* Error Banner */}
      {hasError && !isInConflict && (
        <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4" />
            Sync error
          </div>
          <div className="text-xs mt-1 text-amber-500/80 truncate">
            {syncStatus?.error || "Unknown error"}
          </div>
        </div>
      )}

      {/* Branch Picker with Sync */}
      <div className="p-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <BranchPicker projectId={projectId} currentBranch={status.branch} />
          </div>
          {hasRemote && (
            <button
              onClick={handleSyncClick}
              disabled={isSyncing || isInConflict}
              className={cn(
                "p-1.5 rounded hover:bg-bg-tertiary transition-colors",
                isSyncing && "animate-spin",
                isInConflict && "opacity-50 cursor-not-allowed"
              )}
              title={isSyncing ? "Syncing..." : "Sync with remote"}
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 text-accent-primary" />
              ) : (
                <RefreshCw className="w-4 h-4 text-text-secondary" />
              )}
            </button>
          )}
        </div>

        {/* Sync Status Indicators */}
        {hasRemote && (
          <div className="flex items-center gap-3 mt-2 text-xs">
            {syncStatus && syncStatus.ahead > 0 && (
              <span className="flex items-center gap-1 text-green-500">
                <ArrowUp className="w-3 h-3" />
                {syncStatus.ahead}
              </span>
            )}
            {syncStatus && syncStatus.behind > 0 && (
              <span className="flex items-center gap-1 text-amber-500">
                <ArrowDown className="w-3 h-3" />
                {syncStatus.behind}
              </span>
            )}
            {syncStatus && syncStatus.ahead === 0 && syncStatus.behind === 0 && syncStatus.state === "idle" && (
              <span className="text-text-muted">Up to date</span>
            )}
            {!syncStatus?.hasUpstream && syncStatus?.hasRemote && (
              <span className="text-text-muted flex items-center gap-1">
                <CloudOff className="w-3 h-3" />
                No upstream
              </span>
            )}
          </div>
        )}

        {!hasRemote && (
          <div className="flex items-center gap-1 mt-2 text-xs text-text-muted">
            <CloudOff className="w-3 h-3" />
            No remote configured
          </div>
        )}
      </div>

      {/* Uncommitted Changes */}
      <div className="border-b border-border">
        <div className="px-2 py-1">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Uncommitted Changes
          </div>
        </div>
        <UncommittedChanges
          projectId={projectId}
          files={status.files}
          onCommitClick={handleCommitClick}
        />
      </div>

      {/* Recent Commits */}
      <div className="flex-1 overflow-auto">
        <div className="px-2 py-1 sticky top-0 bg-bg-primary">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Recent Commits
          </div>
        </div>
        <CommitList projectId={projectId} />
      </div>
    </div>
  );
}
