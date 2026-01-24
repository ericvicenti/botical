import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useUI } from "@/contexts/ui";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Check, X, Clock, Loader2, AlertCircle, SkipForward } from "lucide-react";

interface StepExecution {
  stepId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  resolvedArgs?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  projectId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: number;
  completedAt?: number;
  steps: Record<string, StepExecution>;
}

interface WorkflowExecutionPageProps {
  params: {
    executionId: string;
  };
  search?: unknown;
}

export default function WorkflowExecutionPage({ params }: WorkflowExecutionPageProps) {
  const { executionId } = params;
  const { selectedProjectId, setSelectedProject } = useUI();

  const { data: execution, isLoading, error } = useQuery({
    queryKey: ["workflow-executions", executionId, selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId
        ? `/api/workflow-executions/${executionId}?projectId=${selectedProjectId}`
        : `/api/workflow-executions/${executionId}`;
      return apiClient<WorkflowExecution>(url);
    },
    enabled: !!executionId,
    refetchInterval: (query) => {
      // Keep polling while execution is in progress
      const data = query.state.data;
      if (data && (data.status === "pending" || data.status === "running")) {
        return 1000; // Poll every second
      }
      return false; // Stop polling when complete
    },
  });

  // Set selected project when execution loads
  useEffect(() => {
    if (execution?.projectId && execution.projectId !== selectedProjectId) {
      setSelectedProject(execution.projectId);
    }
  }, [execution, selectedProjectId, setSelectedProject]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        <Loader2 className="animate-spin mr-2" size={20} />
        Loading execution...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-accent-error">
        <AlertCircle className="mr-2" size={20} />
        Error: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Execution not found
      </div>
    );
  }

  const stepEntries = Object.entries(execution.steps);

  return (
    <div className="h-full flex flex-col bg-bg-primary" data-testid="workflow-execution">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 bg-bg-secondary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusBadge status={execution.status} />
            <span className="text-text-primary font-medium">Workflow Run</span>
            <span className="text-xs text-text-muted font-mono">{execution.id}</span>
          </div>
          <div className="text-xs text-text-muted">
            Started {new Date(execution.startedAt).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Status Banner */}
          {execution.status === "running" && (
            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded text-blue-400">
              <Loader2 className="animate-spin" size={16} />
              Workflow is running...
            </div>
          )}

          {execution.status === "completed" && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded text-green-400">
              <Check size={16} />
              Workflow completed successfully
            </div>
          )}

          {execution.status === "failed" && (
            <div className="flex flex-col gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400">
              <div className="flex items-center gap-2">
                <X size={16} />
                Workflow failed
              </div>
              {execution.error && (
                <div className="text-sm font-mono bg-bg-primary p-2 rounded">
                  {execution.error}
                </div>
              )}
            </div>
          )}

          {/* Input */}
          {Object.keys(execution.input).length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
                Input
              </h2>
              <div className="p-3 bg-bg-secondary rounded border border-border">
                <pre className="text-sm text-text-primary font-mono overflow-x-auto">
                  {JSON.stringify(execution.input, null, 2)}
                </pre>
              </div>
            </section>
          )}

          {/* Steps */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
              Steps ({stepEntries.length})
            </h2>
            {stepEntries.length === 0 ? (
              <p className="text-text-muted text-sm">No steps recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {stepEntries.map(([stepId, step]) => (
                  <StepCard key={stepId} step={step} />
                ))}
              </div>
            )}
          </section>

          {/* Output */}
          {execution.output && Object.keys(execution.output).length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
                Output
              </h2>
              <div className="p-3 bg-bg-secondary rounded border border-border">
                <pre className="text-sm text-text-primary font-mono overflow-x-auto">
                  {JSON.stringify(execution.output, null, 2)}
                </pre>
              </div>
            </section>
          )}

          {/* Timing */}
          <section className="text-xs text-text-muted space-y-1">
            <div>Started: {new Date(execution.startedAt).toLocaleString()}</div>
            {execution.completedAt && (
              <>
                <div>Completed: {new Date(execution.completedAt).toLocaleString()}</div>
                <div>
                  Duration: {((execution.completedAt - execution.startedAt) / 1000).toFixed(2)}s
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: WorkflowExecution["status"] }) {
  const configs: Record<WorkflowExecution["status"], { icon: typeof Clock; color: string; label: string; spin?: boolean }> = {
    pending: { icon: Clock, color: "text-yellow-400 bg-yellow-400/10", label: "Pending" },
    running: { icon: Loader2, color: "text-blue-400 bg-blue-400/10", label: "Running", spin: true },
    completed: { icon: Check, color: "text-green-400 bg-green-400/10", label: "Completed" },
    failed: { icon: X, color: "text-red-400 bg-red-400/10", label: "Failed" },
    cancelled: { icon: X, color: "text-gray-400 bg-gray-400/10", label: "Cancelled" },
  };

  const config = configs[status];
  const Icon = config.icon;

  return (
    <span className={cn("flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium", config.color)}>
      <Icon size={12} className={config.spin ? "animate-spin" : ""} />
      {config.label}
    </span>
  );
}

function StepCard({ step }: { step: StepExecution }) {
  const statusConfigs: Record<StepExecution["status"], { icon: typeof Clock; color: string; spin?: boolean }> = {
    pending: { icon: Clock, color: "text-yellow-400" },
    running: { icon: Loader2, color: "text-blue-400", spin: true },
    completed: { icon: Check, color: "text-green-400" },
    failed: { icon: X, color: "text-red-400" },
    skipped: { icon: SkipForward, color: "text-gray-400" },
  };

  const config = statusConfigs[step.status];
  const Icon = config.icon;

  return (
    <div className="p-3 bg-bg-secondary rounded border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} className={cn(config.color, config.spin && "animate-spin")} />
          <span className="text-sm font-medium text-text-primary">{step.stepId}</span>
          <span className="text-xs text-text-muted capitalize">{step.status}</span>
        </div>
        {step.startedAt && step.completedAt && (
          <span className="text-xs text-text-muted">
            {((step.completedAt - step.startedAt) / 1000).toFixed(2)}s
          </span>
        )}
      </div>

      {step.error && (
        <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded mt-2 font-mono">
          {step.error}
        </div>
      )}

      {step.output !== undefined && (
        <div className="text-xs text-text-secondary bg-bg-primary p-2 rounded mt-2 font-mono overflow-x-auto">
          <pre>{JSON.stringify(step.output, null, 2)}</pre>
        </div>
      )}

      {step.resolvedArgs && Object.keys(step.resolvedArgs).length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
            Arguments
          </summary>
          <div className="text-xs text-text-secondary bg-bg-primary p-2 rounded mt-1 font-mono overflow-x-auto">
            <pre>{JSON.stringify(step.resolvedArgs, null, 2)}</pre>
          </div>
        </details>
      )}
    </div>
  );
}
