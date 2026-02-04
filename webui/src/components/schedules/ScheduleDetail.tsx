import { useSchedule, useScheduleRuns, useEnableSchedule, useDisableSchedule, useDeleteSchedule, useTriggerSchedule } from "@/lib/api/queries";
import type { Schedule, ScheduleRun, ActionConfig, WorkflowConfig } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Clock, Play, Pause, Trash2, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";

interface ScheduleDetailProps {
  scheduleId: string;
  projectId: string;
  onDelete?: () => void;
}

export function ScheduleDetail({ scheduleId, projectId, onDelete }: ScheduleDetailProps) {
  const { data: schedule, isLoading: scheduleLoading } = useSchedule(scheduleId, projectId);
  const { data: runs, isLoading: runsLoading, refetch: refetchRuns } = useScheduleRuns(scheduleId, projectId);

  const enableSchedule = useEnableSchedule();
  const disableSchedule = useDisableSchedule();
  const deleteSchedule = useDeleteSchedule();
  const triggerSchedule = useTriggerSchedule();

  if (scheduleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="p-4 text-center text-text-muted">
        Schedule not found
      </div>
    );
  }

  const handleToggle = () => {
    if (schedule.enabled) {
      disableSchedule.mutate(
        { scheduleId, projectId },
        {
          onError: (error) => {
            console.error("Failed to disable schedule:", error);
            alert(`Failed to disable schedule: ${error.message}`);
          },
        }
      );
    } else {
      enableSchedule.mutate(
        { scheduleId, projectId },
        {
          onError: (error) => {
            console.error("Failed to enable schedule:", error);
            alert(`Failed to enable schedule: ${error.message}`);
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!confirm(`Delete schedule "${schedule.name}"?`)) {
      return;
    }

    deleteSchedule.mutate(
      { scheduleId, projectId },
      {
        onSuccess: () => {
          onDelete?.();
        },
        onError: (error) => {
          console.error("Failed to delete schedule:", error);
          alert(`Failed to delete schedule: ${error.message}`);
        },
      }
    );
  };

  const handleTrigger = () => {
    triggerSchedule.mutate(
      { scheduleId, projectId },
      {
        onSuccess: () => {
          // Refetch runs to show the new run
          setTimeout(() => refetchRuns(), 1000);
        },
        onError: (error) => {
          console.error("Failed to trigger schedule:", error);
          alert(`Failed to trigger schedule: ${error.message}`);
        },
      }
    );
  };

  const getActionLabel = (): string => {
    if (schedule.actionType === "action") {
      const config = schedule.actionConfig as ActionConfig;
      return config.actionId;
    } else {
      const config = schedule.actionConfig as WorkflowConfig;
      return config.workflowId;
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const isPending = enableSchedule.isPending || disableSchedule.isPending || deleteSchedule.isPending || triggerSchedule.isPending;

  return (
    <div className="flex flex-col h-full" data-testid="schedule-detail">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium text-text-primary">{schedule.name}</h2>
            {schedule.description && (
              <p className="text-sm text-text-muted mt-1">{schedule.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTrigger}
              disabled={isPending}
              className={cn(
                "px-3 py-1.5 rounded text-sm flex items-center gap-1.5",
                "bg-accent-primary text-white",
                "hover:bg-accent-primary/90 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {triggerSchedule.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Run Now
            </button>

            <button
              onClick={handleToggle}
              disabled={isPending}
              className={cn(
                "px-3 py-1.5 rounded text-sm flex items-center gap-1.5",
                "border border-border",
                "hover:bg-bg-elevated transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {schedule.enabled ? (
                <>
                  <Pause className="w-4 h-4" />
                  Disable
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Enable
                </>
              )}
            </button>

            <button
              onClick={handleDelete}
              disabled={isPending}
              className={cn(
                "p-1.5 rounded text-red-500",
                "hover:bg-red-500/10 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              title="Delete schedule"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Schedule Info */}
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-text-muted">Status</div>
            <div className={cn("font-medium", schedule.enabled ? "text-green-500" : "text-text-muted")}>
              {schedule.enabled ? "Enabled" : "Disabled"}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Schedule</div>
            <div className="font-mono text-text-primary">{schedule.cronExpression}</div>
          </div>
          <div>
            <div className="text-text-muted">Action Type</div>
            <div className="text-text-primary capitalize">{schedule.actionType}</div>
          </div>
          <div>
            <div className="text-text-muted">Action</div>
            <div className="text-text-primary font-mono text-xs">{getActionLabel()}</div>
          </div>
          <div>
            <div className="text-text-muted">Next Run</div>
            <div className="text-text-primary">
              {schedule.nextRunAt ? formatDate(schedule.nextRunAt) : "Not scheduled"}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Last Run</div>
            <div className="text-text-primary">
              {schedule.lastRunAt ? formatDate(schedule.lastRunAt) : "Never"}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Timezone</div>
            <div className="text-text-primary">{schedule.timezone}</div>
          </div>
          <div>
            <div className="text-text-muted">Max Runtime</div>
            <div className="text-text-primary">{schedule.maxRuntimeMs / 1000}s</div>
          </div>
        </div>
      </div>

      {/* Run History */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
            Run History
          </h3>
          <button
            onClick={() => refetchRuns()}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {runsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : !runs || runs.length === 0 ? (
          <div className="text-center py-8 text-sm text-text-muted">
            No run history available
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <RunItem key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunItem({ run }: { run: ScheduleRun }) {
  const getStatusIcon = () => {
    switch (run.status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />;
      case "pending":
        return <Clock className="w-4 h-4 text-blue-500" />;
      case "failed":
      case "timeout":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-text-muted" />;
    }
  };

  const getStatusColor = () => {
    switch (run.status) {
      case "success":
        return "text-green-500";
      case "running":
        return "text-yellow-500";
      case "pending":
        return "text-blue-500";
      case "failed":
      case "timeout":
        return "text-red-500";
      default:
        return "text-text-muted";
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getDuration = (): string | null => {
    if (!run.startedAt || !run.completedAt) return null;
    const duration = run.completedAt - run.startedAt;
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
  };

  const duration = getDuration();

  return (
    <div className="p-3 rounded bg-bg-elevated border border-border">
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className={cn("text-sm font-medium capitalize", getStatusColor())}>
          {run.status}
        </span>
        <span className="text-xs text-text-muted">
          {formatDate(run.scheduledFor)}
        </span>
        {duration && (
          <span className="text-xs text-text-muted ml-auto">
            {duration}
          </span>
        )}
      </div>

      {run.output && (
        <div className="mt-2 text-xs font-mono text-text-muted bg-bg-primary rounded p-2 max-h-24 overflow-auto">
          {run.output}
        </div>
      )}

      {run.error && (
        <div className="mt-2 text-xs text-red-500 bg-red-500/10 rounded p-2">
          {run.error}
        </div>
      )}
    </div>
  );
}
