import { useState } from "react";
import { useSchedules, useCreateSchedule, useWorkflows, useBackendActions } from "@/lib/api/queries";
import { ScheduleItem } from "./ScheduleItem";
import type { Schedule, ScheduleActionType, ActionConfig, WorkflowConfig } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Plus, Clock, ChevronDown, ChevronRight } from "lucide-react";

interface SchedulesPanelProps {
  projectId: string;
}

export function SchedulesPanel({ projectId }: SchedulesPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { data: schedules, isLoading } = useSchedules(projectId);

  const enabled = schedules?.filter((s) => s.enabled) || [];
  const disabled = schedules?.filter((s) => !s.enabled) || [];

  return (
    <div className="h-full flex flex-col" data-testid="schedules-panel">
      <div className="px-2 py-1 border-b border-border flex items-center justify-between">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Schedules
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={cn(
            "p-0.5 rounded hover:bg-bg-elevated transition-colors",
            "text-text-secondary hover:text-accent-primary",
            showCreateForm && "text-accent-primary bg-bg-elevated"
          )}
          title="Create new schedule"
          data-testid="new-schedule-button"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showCreateForm && (
        <div className="p-2 border-b border-border bg-bg-elevated/50">
          <CreateScheduleForm
            projectId={projectId}
            onClose={() => setShowCreateForm(false)}
          />
        </div>
      )}

      <div className="flex-1 overflow-auto py-1">
        {isLoading ? (
          <div className="py-2 text-sm text-text-muted text-center">
            Loading schedules...
          </div>
        ) : !schedules || schedules.length === 0 ? (
          <EmptyState onCreateClick={() => setShowCreateForm(true)} />
        ) : (
          <div className="space-y-2">
            {enabled.length > 0 && (
              <ScheduleSection
                title="Enabled"
                count={enabled.length}
                schedules={enabled}
                projectId={projectId}
                defaultOpen
              />
            )}
            {disabled.length > 0 && (
              <ScheduleSection
                title="Disabled"
                count={disabled.length}
                schedules={disabled}
                projectId={projectId}
                defaultOpen={enabled.length === 0}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ScheduleSectionProps {
  title: string;
  count: number;
  schedules: Schedule[];
  projectId: string;
  defaultOpen?: boolean;
}

function ScheduleSection({ title, count, schedules, projectId, defaultOpen = true }: ScheduleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-2 py-1 flex items-center gap-1 text-xs text-text-muted uppercase tracking-wide hover:text-text-secondary"
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {title} ({count})
      </button>
      {isOpen && (
        <div>
          {schedules.map((schedule) => (
            <ScheduleItem key={schedule.id} schedule={schedule} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="py-6 text-center" data-testid="no-schedules-message">
      <Clock className="w-8 h-8 mx-auto text-text-muted mb-2" />
      <div className="text-sm text-text-muted mb-1">No schedules configured</div>
      <div className="text-xs text-text-muted mb-3">
        Create schedules to run actions automatically
      </div>
      <button
        onClick={onCreateClick}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm",
          "bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
        )}
      >
        <Plus className="w-4 h-4" />
        Create Schedule
      </button>
    </div>
  );
}

interface CreateScheduleFormProps {
  projectId: string;
  onClose: () => void;
}

function CreateScheduleForm({ projectId, onClose }: CreateScheduleFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [actionType, setActionType] = useState<ScheduleActionType>("action");
  const [actionId, setActionId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createSchedule = useCreateSchedule();
  const { data: workflows } = useWorkflows(projectId);
  const { data: actions } = useBackendActions();

  // Common cron presets
  const presets = [
    { label: "Every hour", value: "@hourly" },
    { label: "Every day at midnight", value: "@daily" },
    { label: "Every week", value: "@weekly" },
    { label: "Every month", value: "@monthly" },
    { label: "Every 15 minutes", value: "*/15 * * * *" },
    { label: "Weekdays at 9 AM", value: "0 9 * * 1-5" },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !cronExpression.trim()) {
      return;
    }

    let actionConfig: ActionConfig | WorkflowConfig;
    if (actionType === "action") {
      if (!actionId) return;
      actionConfig = { actionId };
    } else {
      if (!workflowId) return;
      actionConfig = { workflowId };
    }

    createSchedule.mutate(
      {
        projectId,
        name: name.trim(),
        description: description.trim() || undefined,
        actionType,
        actionConfig,
        cronExpression: cronExpression.trim(),
        timezone,
        enabled: true,
      },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setActionId("");
          setWorkflowId("");
          setCronExpression("");
          onClose();
        },
        onError: (error) => {
          console.error("Failed to create schedule:", error);
          alert(`Failed to create schedule: ${error.message}`);
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="create-schedule-form">
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Schedule Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Daily Backup"
          className={cn(
            "w-full px-2 py-1.5 text-sm rounded border border-border",
            "bg-bg-primary text-text-primary",
            "focus:outline-none focus:border-accent-primary"
          )}
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Action Type
        </label>
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as ScheduleActionType)}
          className={cn(
            "w-full px-2 py-1.5 text-sm rounded border border-border",
            "bg-bg-primary text-text-primary",
            "focus:outline-none focus:border-accent-primary"
          )}
        >
          <option value="action">Action</option>
          <option value="workflow">Workflow</option>
        </select>
      </div>

      {actionType === "action" ? (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Select Action
          </label>
          <select
            value={actionId}
            onChange={(e) => setActionId(e.target.value)}
            className={cn(
              "w-full px-2 py-1.5 text-sm rounded border border-border",
              "bg-bg-primary text-text-primary",
              "focus:outline-none focus:border-accent-primary"
            )}
          >
            <option value="">Choose an action...</option>
            {actions?.map((action) => (
              <option key={action.id} value={action.id}>
                {action.label || action.id}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Select Workflow
          </label>
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            className={cn(
              "w-full px-2 py-1.5 text-sm rounded border border-border",
              "bg-bg-primary text-text-primary",
              "focus:outline-none focus:border-accent-primary"
            )}
          >
            <option value="">Choose a workflow...</option>
            {workflows?.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Schedule (Cron)
        </label>
        <input
          type="text"
          value={cronExpression}
          onChange={(e) => setCronExpression(e.target.value)}
          placeholder="e.g., 0 9 * * 1-5"
          className={cn(
            "w-full px-2 py-1.5 text-sm rounded border border-border",
            "bg-bg-primary text-text-primary font-mono",
            "focus:outline-none focus:border-accent-primary"
          )}
        />
        <div className="flex flex-wrap gap-1 mt-1">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setCronExpression(preset.value)}
              className="px-1.5 py-0.5 text-xs bg-bg-elevated hover:bg-border rounded text-text-muted hover:text-text-secondary"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs text-text-muted hover:text-text-secondary"
      >
        {showAdvanced ? "Hide" : "Show"} advanced options
      </button>

      {showAdvanced && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this schedule do?"
              rows={2}
              className={cn(
                "w-full px-2 py-1.5 text-sm rounded border border-border",
                "bg-bg-primary text-text-primary",
                "focus:outline-none focus:border-accent-primary resize-none"
              )}
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={cn(
                "w-full px-2 py-1.5 text-sm rounded border border-border",
                "bg-bg-primary text-text-primary",
                "focus:outline-none focus:border-accent-primary"
              )}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
              <option value="Asia/Shanghai">Asia/Shanghai</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={
            !name.trim() ||
            !cronExpression.trim() ||
            (actionType === "action" ? !actionId : !workflowId) ||
            createSchedule.isPending
          }
          className={cn(
            "flex-1 px-3 py-1.5 rounded text-sm font-medium",
            "bg-accent-primary text-white",
            "hover:bg-accent-primary/90 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {createSchedule.isPending ? "Creating..." : "Create Schedule"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "px-3 py-1.5 rounded text-sm",
            "text-text-secondary hover:text-text-primary",
            "hover:bg-bg-elevated transition-colors"
          )}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
