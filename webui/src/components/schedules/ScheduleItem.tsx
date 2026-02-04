import { useState } from "react";
import { useEnableSchedule, useDisableSchedule, useDeleteSchedule, useTriggerSchedule } from "@/lib/api/queries";
import type { Schedule, ActionConfig, WorkflowConfig } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Clock, Play, Pause, Trash2, MoreHorizontal, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";

interface ScheduleItemProps {
  schedule: Schedule;
  projectId: string;
}

export function ScheduleItem({ schedule, projectId }: ScheduleItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const enableSchedule = useEnableSchedule();
  const disableSchedule = useDisableSchedule();
  const deleteSchedule = useDeleteSchedule();
  const triggerSchedule = useTriggerSchedule();

  const handleEnable = () => {
    enableSchedule.mutate(
      { scheduleId: schedule.id, projectId },
      {
        onError: (error) => {
          console.error("Failed to enable schedule:", error);
          alert(`Failed to enable schedule: ${error.message}`);
        },
      }
    );
    setMenuOpen(false);
  };

  const handleDisable = () => {
    disableSchedule.mutate(
      { scheduleId: schedule.id, projectId },
      {
        onError: (error) => {
          console.error("Failed to disable schedule:", error);
          alert(`Failed to disable schedule: ${error.message}`);
        },
      }
    );
    setMenuOpen(false);
  };

  const handleDelete = () => {
    if (!confirm(`Delete schedule "${schedule.name}"?`)) {
      return;
    }

    deleteSchedule.mutate(
      { scheduleId: schedule.id, projectId },
      {
        onError: (error) => {
          console.error("Failed to delete schedule:", error);
          alert(`Failed to delete schedule: ${error.message}`);
        },
      }
    );
    setMenuOpen(false);
  };

  const handleTrigger = () => {
    triggerSchedule.mutate(
      { scheduleId: schedule.id, projectId },
      {
        onError: (error) => {
          console.error("Failed to trigger schedule:", error);
          alert(`Failed to trigger schedule: ${error.message}`);
        },
      }
    );
    setMenuOpen(false);
  };

  const getStatusIcon = () => {
    if (!schedule.lastRunStatus) {
      return <Clock className="w-3 h-3 text-text-muted" />;
    }

    switch (schedule.lastRunStatus) {
      case "success":
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case "running":
        return <Loader2 className="w-3 h-3 text-yellow-500 animate-spin" />;
      case "failed":
      case "timeout":
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Clock className="w-3 h-3 text-text-muted" />;
    }
  };

  const getActionLabel = (): string => {
    if (schedule.actionType === "action") {
      const config = schedule.actionConfig as ActionConfig;
      return config.actionId;
    } else {
      const config = schedule.actionConfig as WorkflowConfig;
      return `Workflow: ${config.workflowId}`;
    }
  };

  const formatNextRun = (): string => {
    if (!schedule.nextRunAt) {
      return "Not scheduled";
    }
    const date = new Date(schedule.nextRunAt);
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff < 0) {
      return "Overdue";
    } else if (diff < 60000) {
      return "< 1 min";
    } else if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins} min${mins !== 1 ? "s" : ""}`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hr${hours !== 1 ? "s" : ""}`;
    } else {
      const days = Math.floor(diff / 86400000);
      return `${days} day${days !== 1 ? "s" : ""}`;
    }
  };

  const isPending = enableSchedule.isPending || disableSchedule.isPending || deleteSchedule.isPending || triggerSchedule.isPending;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded group",
        "hover:bg-bg-elevated transition-colors",
        !schedule.enabled && "opacity-60"
      )}
      data-testid={`schedule-item-${schedule.id}`}
    >
      <div
        className={cn(
          "w-6 h-6 flex items-center justify-center rounded",
          schedule.enabled ? "text-accent-primary" : "text-text-muted"
        )}
      >
        <Clock className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary truncate">{schedule.name}</div>
        <div className="text-xs text-text-muted truncate">
          {schedule.cronExpression} - Next: {formatNextRun()}
        </div>
      </div>

      <div className="flex items-center gap-1" title={`Last run: ${schedule.lastRunStatus || "Never"}`}>
        {getStatusIcon()}
      </div>

      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          disabled={isPending}
          className={cn(
            "p-1 rounded transition-colors",
            "text-text-muted hover:text-text-primary hover:bg-bg-primary",
            "opacity-0 group-hover:opacity-100",
            isPending && "opacity-50"
          )}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MoreHorizontal className="w-4 h-4" />
          )}
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-50 bg-bg-elevated border border-border rounded shadow-lg py-1 min-w-36">
              <button
                onClick={handleTrigger}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5" />
                Run Now
              </button>

              {schedule.enabled ? (
                <button
                  onClick={handleDisable}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Disable
                </button>
              ) : (
                <button
                  onClick={handleEnable}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5" />
                  Enable
                </button>
              )}

              <div className="border-t border-border my-1" />

              <button
                onClick={handleDelete}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-primary flex items-center gap-2 text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
