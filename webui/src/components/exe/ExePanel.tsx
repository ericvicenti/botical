import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  useExeStatus,
  useExeVMs,
  useCreateExeVM,
  useDeleteExeVM,
  useRestartExeVM,
  useExeExec,
  type ExeVM,
} from "@/lib/api/queries";
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  Terminal,
  ExternalLink,
  AlertCircle,
  Loader2,
  Play,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export function ExePanel() {
  const { data: status, isLoading: statusLoading } = useExeStatus();
  const { data: vms, isLoading: vmsLoading, refetch: refetchVMs } = useExeVMs();
  const createVM = useCreateExeVM();
  const deleteVM = useDeleteExeVM();
  const restartVM = useRestartExeVM();
  const execCommand = useExeExec();

  const [selectedVM, setSelectedVM] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState("");
  const [commandOutput, setCommandOutput] = useState<{
    vmName: string;
    command: string;
    output: string;
    error?: string;
    exitCode: number;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newVMName, setNewVMName] = useState("");

  const handleCreateVM = async () => {
    try {
      await createVM.mutateAsync({ name: newVMName || undefined });
      setNewVMName("");
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create VM:", error);
      alert(`Failed to create VM: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleDeleteVM = async (name: string) => {
    if (!confirm(`Are you sure you want to delete VM "${name}"?`)) return;
    try {
      await deleteVM.mutateAsync({ name });
      if (selectedVM === name) {
        setSelectedVM(null);
      }
    } catch (error) {
      console.error("Failed to delete VM:", error);
      alert(`Failed to delete VM: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleRestartVM = async (name: string) => {
    try {
      await restartVM.mutateAsync({ name });
    } catch (error) {
      console.error("Failed to restart VM:", error);
      alert(`Failed to restart VM: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleExec = async (vmName: string) => {
    if (!commandInput.trim()) return;
    try {
      const result = await execCommand.mutateAsync({
        name: vmName,
        command: commandInput,
      });
      setCommandOutput({
        vmName,
        command: commandInput,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
      });
      setCommandInput("");
    } catch (error) {
      console.error("Failed to execute command:", error);
      setCommandOutput({
        vmName,
        command: commandInput,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
        exitCode: -1,
      });
    }
  };

  // Show loading state
  if (statusLoading) {
    return (
      <div className="h-full flex flex-col">
        <PanelHeader onRefresh={() => refetchVMs()} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      </div>
    );
  }

  // Show error state if not authenticated
  if (status && !status.authenticated) {
    return (
      <div className="h-full flex flex-col">
        <PanelHeader onRefresh={() => refetchVMs()} />
        <div className="flex-1 p-4">
          <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-yellow-500 mb-1">Setup Required</div>
              <div className="text-text-muted">
                {status.error || "Please complete exe.dev setup."}
              </div>
              <div className="mt-2 text-text-secondary">
                Run{" "}
                <code className="px-1 py-0.5 bg-bg-primary rounded text-text-primary">
                  ssh exe.dev
                </code>{" "}
                in your terminal to register.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        onRefresh={() => refetchVMs()}
        onCreateClick={() => setIsCreating(true)}
      />

      <div className="flex-1 overflow-auto">
        {/* Create VM form */}
        {isCreating && (
          <div className="p-3 border-b border-border bg-bg-elevated">
            <div className="text-xs font-medium text-text-secondary mb-2">
              Create New VM
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newVMName}
                onChange={(e) => setNewVMName(e.target.value)}
                placeholder="VM name (optional)"
                className="flex-1 px-2 py-1 text-sm bg-bg-primary border border-border rounded focus:outline-none focus:border-accent-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateVM();
                  if (e.key === "Escape") {
                    setIsCreating(false);
                    setNewVMName("");
                  }
                }}
                autoFocus
              />
              <button
                onClick={handleCreateVM}
                disabled={createVM.isPending}
                className="px-2 py-1 text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/90 disabled:opacity-50"
              >
                {createVM.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewVMName("");
                }}
                className="px-2 py-1 text-sm text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* VM List */}
        {vmsLoading ? (
          <div className="p-4 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : vms && vms.length > 0 ? (
          <div className="py-1">
            {vms.map((vm) => (
              <VMItem
                key={vm.name}
                vm={vm}
                isSelected={selectedVM === vm.name}
                onSelect={() =>
                  setSelectedVM(selectedVM === vm.name ? null : vm.name)
                }
                onDelete={() => handleDeleteVM(vm.name)}
                onRestart={() => handleRestartVM(vm.name)}
                onExec={handleExec}
                commandInput={commandInput}
                onCommandInputChange={setCommandInput}
                commandOutput={
                  commandOutput?.vmName === vm.name ? commandOutput : null
                }
                onClearOutput={() => setCommandOutput(null)}
                isDeleting={deleteVM.isPending}
                isRestarting={restartVM.isPending}
                isExecuting={execCommand.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="p-4 text-center text-sm text-text-muted">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div>No VMs yet</div>
            <button
              onClick={() => setIsCreating(true)}
              className="mt-2 text-accent-primary hover:underline"
            >
              Create your first VM
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelHeader({
  onRefresh,
  onCreateClick,
}: {
  onRefresh: () => void;
  onCreateClick?: () => void;
}) {
  return (
    <div className="px-2 py-1 border-b border-border flex items-center justify-between">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        Exe VMs
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onRefresh}
          className="p-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        {onCreateClick && (
          <button
            onClick={onCreateClick}
            className="p-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
            title="Create VM"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function VMItem({
  vm,
  isSelected,
  onSelect,
  onDelete,
  onRestart,
  onExec,
  commandInput,
  onCommandInputChange,
  commandOutput,
  onClearOutput,
  isDeleting,
  isRestarting,
  isExecuting,
}: {
  vm: ExeVM;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRestart: () => void;
  onExec: (vmName: string) => void;
  commandInput: string;
  onCommandInputChange: (value: string) => void;
  commandOutput: {
    vmName: string;
    command: string;
    output: string;
    error?: string;
    exitCode: number;
  } | null;
  onClearOutput: () => void;
  isDeleting: boolean;
  isRestarting: boolean;
  isExecuting: boolean;
}) {
  const statusColors = {
    running: "bg-green-500",
    stopped: "bg-gray-500",
    creating: "bg-yellow-500",
    unknown: "bg-gray-400",
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onSelect}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          isSelected ? "bg-bg-elevated" : "hover:bg-bg-elevated/50"
        )}
      >
        {isSelected ? (
          <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
        )}
        <Server className="w-4 h-4 text-accent-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-primary truncate">{vm.name}</span>
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                statusColors[vm.status]
              )}
              title={vm.status}
            />
          </div>
        </div>
        <a
          href={vm.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-bg-primary transition-colors text-text-muted hover:text-accent-primary"
          title="Open in browser"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </button>

      {isSelected && (
        <div className="px-3 pb-3 bg-bg-elevated">
          {/* VM Info */}
          <div className="text-xs text-text-muted mb-3 space-y-1">
            <div>
              Status: <span className="text-text-secondary">{vm.status}</span>
            </div>
            {vm.url && (
              <div>
                URL:{" "}
                <a
                  href={vm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  {vm.url}
                </a>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={onRestart}
              disabled={isRestarting}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-bg-primary border border-border rounded hover:bg-bg-secondary disabled:opacity-50"
            >
              {isRestarting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Restart
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 border border-red-500/30 text-red-500 rounded hover:bg-red-500/20 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              Delete
            </button>
          </div>

          {/* Command input */}
          <div className="mb-2">
            <div className="flex items-center gap-1 text-xs text-text-muted mb-1">
              <Terminal className="w-3 h-3" />
              Run command
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => onCommandInputChange(e.target.value)}
                placeholder="Enter command..."
                className="flex-1 px-2 py-1 text-sm bg-bg-primary border border-border rounded focus:outline-none focus:border-accent-primary font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && commandInput.trim()) {
                    onExec(vm.name);
                  }
                }}
              />
              <button
                onClick={() => onExec(vm.name)}
                disabled={!commandInput.trim() || isExecuting}
                className="px-2 py-1 bg-accent-primary text-white rounded hover:bg-accent-primary/90 disabled:opacity-50"
              >
                {isExecuting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Command output */}
          {commandOutput && (
            <div className="bg-bg-primary border border-border rounded overflow-hidden">
              <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-bg-secondary">
                <div className="text-xs text-text-muted font-mono truncate">
                  $ {commandOutput.command}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs",
                      commandOutput.exitCode === 0
                        ? "text-green-500"
                        : "text-red-500"
                    )}
                  >
                    exit: {commandOutput.exitCode}
                  </span>
                  <button
                    onClick={onClearOutput}
                    className="p-0.5 rounded hover:bg-bg-primary text-text-muted hover:text-text-primary"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <pre className="p-2 text-xs font-mono text-text-primary overflow-auto max-h-48 whitespace-pre-wrap">
                {commandOutput.output || commandOutput.error || "(no output)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
