import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useUI } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Save, Play, Trash2, Plus, GripVertical, Search, X, Bell, FileText, XCircle, CheckCircle } from "lucide-react";

interface WorkflowInputField {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
}

interface ArgBinding {
  type: "literal" | "input" | "step";
  value?: unknown;
  path?: string;
  stepId?: string;
}

interface WorkflowStep {
  id: string;
  type: "action" | "notify" | "resolve" | "reject" | "log";
  action?: string;
  args?: Record<string, ArgBinding>;
  dependsOn?: string[];
  if?: unknown;
  message?: ArgBinding;
  variant?: "info" | "success" | "warning" | "error";
  output?: Record<string, ArgBinding>;
  onError?: {
    strategy: "fail" | "continue" | "retry";
    retryCount?: number;
    retryDelay?: number;
  };
}

interface Workflow {
  id: string;
  projectId: string;
  name: string;
  label: string;
  description: string;
  category: string;
  icon?: string;
  inputSchema: {
    fields: WorkflowInputField[];
  };
  steps: WorkflowStep[];
}

interface BackendAction {
  id: string;
  label: string;
  description: string;
  category: string;
  icon?: string;
  params: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
    options?: string[];
  }>;
}

// Built-in step types that aren't actions
const BUILTIN_STEP_TYPES = [
  { id: "notify", label: "Notify", description: "Show a notification to the user", icon: Bell },
  { id: "log", label: "Log", description: "Log a message", icon: FileText },
  { id: "reject", label: "Throw", description: "Fail the workflow with an error", icon: XCircle },
  { id: "resolve", label: "Return", description: "Complete the workflow with output", icon: CheckCircle },
];

interface WorkflowEditorPageProps {
  params: {
    workflowId: string;
  };
  search?: unknown;
}

export default function WorkflowEditorPage({ params }: WorkflowEditorPageProps) {
  const { workflowId } = params;
  const { selectedProjectId, setSelectedProject } = useUI();
  const { markDirty, updateTabLabel } = useTabs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Tab ID for this workflow - must match generateTabId output
  const tabId = `workflow.editor:${workflowId}`;

  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [inputFields, setInputFields] = useState<WorkflowInputField[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Fetch workflow - can work without selectedProjectId (API will search all projects)
  const { data: workflow, isLoading, error } = useQuery({
    queryKey: ["workflows", workflowId, selectedProjectId],
    queryFn: async () => {
      // If we have a selectedProjectId, use it for faster lookup
      const url = selectedProjectId
        ? `/api/workflows/${workflowId}?projectId=${selectedProjectId}`
        : `/api/workflows/${workflowId}`;
      return apiClient<Workflow>(url);
    },
    enabled: !!workflowId,
  });

  // Fetch available actions
  const { data: actions } = useQuery({
    queryKey: ["actions"],
    queryFn: async () => {
      // apiClient already extracts data.data from the response
      return apiClient<BackendAction[]>("/api/tools/actions");
    },
  });

  // Update local state when workflow loads
  useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      setLabel(workflow.label);
      setDescription(workflow.description);
      setSteps(workflow.steps);
      setInputFields(workflow.inputSchema.fields);
      setIsDirty(false);

      // Update tab label with the workflow's actual label
      if (workflow.label) {
        updateTabLabel(tabId, workflow.label);
      }

      // If the workflow belongs to a different project, switch to it
      if (workflow.projectId && workflow.projectId !== selectedProjectId) {
        setSelectedProject(workflow.projectId);
      }
    }
  }, [workflow, selectedProjectId, setSelectedProject, tabId, updateTabLabel]);

  // Sync dirty state with tabs
  useEffect(() => {
    markDirty(tabId, isDirty);
  }, [tabId, isDirty, markDirty]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiClient(`/api/workflows/${workflowId}`, {
        method: "PUT",
        body: JSON.stringify({
          projectId: selectedProjectId,
          name,
          label,
          description,
          inputSchema: { fields: inputFields },
          steps,
        }),
      });
    },
    onSuccess: () => {
      // Refetch both the individual workflow and the list
      queryClient.refetchQueries({ queryKey: ["workflows", workflowId] });
      queryClient.refetchQueries({ queryKey: ["projects", selectedProjectId, "workflows"] });
      setIsDirty(false);
    },
    onError: (err) => {
      console.error("Failed to save workflow:", err);
      alert(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
    },
  });

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      // For now, just run with empty input - later we can add an input dialog
      const response = await apiClient<{ executionId: string }>(
        `/api/workflows/${workflowId}/execute`,
        {
          method: "POST",
          body: JSON.stringify({
            projectId: selectedProjectId,
            input: {},
          }),
        }
      );
      return response;
    },
    onSuccess: (data) => {
      // Navigate to the execution page
      navigate({ to: `/workflow-runs/${data.executionId}` });
    },
    onError: (err) => {
      console.error("Failed to execute workflow:", err);
      alert(`Failed to run: ${err instanceof Error ? err.message : "Unknown error"}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient(`/api/workflows/${workflowId}?projectId=${selectedProjectId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      navigate({ to: `/projects/${selectedProjectId}` });
    },
    onError: (err) => {
      console.error("Failed to delete workflow:", err);
      alert(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    },
  });

  // Save handler
  const handleSave = useCallback(() => {
    if (!isDirty || saveMutation.isPending) return;
    saveMutation.mutate();
  }, [isDirty, saveMutation]);

  // Keyboard shortcut for Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  const addStep = () => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      type: "action",
      args: {},
      dependsOn: [],
    };
    setSteps([...steps, newStep]);
    setIsDirty(true);
  };

  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setSteps(newSteps);
    setIsDirty(true);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const addInputField = () => {
    const newField: WorkflowInputField = {
      name: `field${inputFields.length + 1}`,
      type: "string",
      label: `Field ${inputFields.length + 1}`,
    };
    setInputFields([...inputFields, newField]);
    setIsDirty(true);
  };

  const updateInputField = (index: number, updates: Partial<WorkflowInputField>) => {
    const newFields = [...inputFields];
    newFields[index] = { ...newFields[index], ...updates };
    setInputFields(newFields);
    setIsDirty(true);
  };

  const removeInputField = (index: number) => {
    setInputFields(inputFields.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  if (!selectedProjectId) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        No project selected
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary" data-testid="workflow-loading">
        Loading workflow...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-accent-error" data-testid="workflow-error">
        Error loading workflow: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary" data-testid="workflow-editor">
      {/* Header */}
      <div className="border-b border-border px-3 sm:px-4 py-3 bg-bg-secondary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-text-primary font-medium flex items-center gap-2 truncate" data-testid="workflow-label">
              {label || "Untitled Workflow"}
              {isDirty && <span className="w-2 h-2 rounded-full bg-accent-warning shrink-0" data-testid="workflow-dirty-indicator" />}
            </span>
            <span className="text-xs text-text-muted font-mono hidden sm:inline" data-testid="workflow-name">{name || "new-workflow"}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSave}
              disabled={!isDirty || saveMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary text-white rounded hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="workflow-save-button"
            >
              <Save size={16} />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                if (isDirty) {
                  if (!confirm("You have unsaved changes. Run anyway?")) {
                    return;
                  }
                }
                executeMutation.mutate();
              }}
              disabled={executeMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="workflow-run-button"
            >
              <Play size={16} />
              {executeMutation.isPending ? "Starting..." : "Run"}
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this workflow?")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-400/10 rounded disabled:opacity-50"
              data-testid="workflow-delete-button"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-3 sm:p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Metadata */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
              Workflow Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 bg-bg-secondary rounded border border-border text-text-primary"
                  placeholder="My Workflow"
                  data-testid="workflow-label-input"
                />
                <p className="text-xs text-text-muted mt-1">Display name shown in the sidebar</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Name (ID)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 bg-bg-secondary rounded border border-border text-text-primary"
                    placeholder="my-workflow"
                  />
                  <p className="text-xs text-text-muted mt-1">Unique identifier (lowercase, hyphens only)</p>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 bg-bg-secondary rounded border border-border text-text-primary"
                    placeholder="What this workflow does..."
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Input Schema */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
                Input Fields
              </h2>
              <button
                onClick={addInputField}
                className="flex items-center gap-1 text-sm text-accent-primary hover:text-accent-primary/80"
              >
                <Plus size={14} />
                Add Field
              </button>
            </div>
            {inputFields.length === 0 ? (
              <p className="text-text-muted text-sm">No input fields defined.</p>
            ) : (
              <div className="space-y-2">
                {inputFields.map((field, index) => {
                  const hasDefault = field.default !== undefined;
                  return (
                    <div
                      key={index}
                      className="p-3 bg-bg-secondary rounded border border-border space-y-2"
                    >
                      {/* Main row */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <GripVertical size={16} className="text-text-muted hidden sm:block" />
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => updateInputField(index, { name: e.target.value })}
                          className="w-full sm:w-32 px-2 py-1.5 sm:py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
                          placeholder="name"
                        />
                        <select
                          value={field.type}
                          onChange={(e) =>
                            updateInputField(index, { type: e.target.value as WorkflowInputField["type"] })
                          }
                          className="px-2 py-1.5 sm:py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
                        >
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                          <option value="enum">Enum</option>
                        </select>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateInputField(index, { label: e.target.value })}
                          className="flex-1 min-w-0 px-2 py-1.5 sm:py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
                          placeholder="Label"
                        />
                        <button
                          onClick={() => removeInputField(index)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Default value row */}
                      <div className="flex items-center gap-3 pl-7">
                        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hasDefault}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Enable default - set a default value and mark as not required
                                const defaultVal = field.type === "boolean" ? false : field.type === "number" ? 0 : "";
                                updateInputField(index, { default: defaultVal, required: false });
                              } else {
                                // Disable default - remove default value
                                updateInputField(index, { default: undefined });
                              }
                            }}
                            className="rounded"
                          />
                          Default
                        </label>
                        {hasDefault && (
                          field.type === "boolean" ? (
                            <select
                              value={field.default === true ? "true" : "false"}
                              onChange={(e) => updateInputField(index, { default: e.target.value === "true" })}
                              className="px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
                            >
                              <option value="false">false</option>
                              <option value="true">true</option>
                            </select>
                          ) : field.type === "number" ? (
                            <input
                              type="number"
                              value={(field.default as number) ?? 0}
                              onChange={(e) => updateInputField(index, { default: Number(e.target.value) })}
                              className="w-32 px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
                              placeholder="Default value"
                            />
                          ) : (
                            <input
                              type="text"
                              value={(field.default as string) ?? ""}
                              onChange={(e) => updateInputField(index, { default: e.target.value })}
                              className="flex-1 px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
                              placeholder="Default value"
                            />
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Steps */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
                Steps
              </h2>
              <button
                onClick={addStep}
                className="flex items-center gap-1 text-sm text-accent-primary hover:text-accent-primary/80"
              >
                <Plus size={14} />
                Add Step
              </button>
            </div>
            {steps.length === 0 ? (
              <p className="text-text-muted text-sm">No steps defined. Add a step to get started.</p>
            ) : (
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    index={index}
                    actions={actions || []}
                    inputFields={inputFields}
                    previousSteps={steps.slice(0, index)}
                    onUpdate={(updates) => updateStep(index, updates)}
                    onRemove={() => removeStep(index)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Status bar */}
      <div className="h-6 px-2 flex items-center justify-between bg-bg-secondary border-t border-border text-xs text-text-secondary">
        <span className={cn(isDirty && "text-accent-warning")}>
          {saveMutation.isPending ? "Saving..." : isDirty ? "Modified" : "Saved"}
        </span>
        <span>{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

// Step Editor Component
interface StepEditorProps {
  step: WorkflowStep;
  index: number;
  actions: BackendAction[];
  inputFields: WorkflowInputField[];
  previousSteps: WorkflowStep[];
  onUpdate: (updates: Partial<WorkflowStep>) => void;
  onRemove: () => void;
}

function StepEditor({ step, index: _index, actions, inputFields, previousSteps, onUpdate, onRemove }: StepEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Get the selected action's metadata
  const selectedAction = useMemo(() => {
    if (step.type === "action" && step.action) {
      return actions.find((a) => a.id === step.action);
    }
    return null;
  }, [step.type, step.action, actions]);

  // Get the selected builtin type
  const selectedBuiltin = useMemo(() => {
    if (step.type !== "action") {
      return BUILTIN_STEP_TYPES.find((b) => b.id === step.type);
    }
    return null;
  }, [step.type]);

  // Filter actions based on search
  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filteredActions = actions.filter(
      (a) =>
        a.label.toLowerCase().includes(query) ||
        a.id.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query)
    );
    const filteredBuiltins = BUILTIN_STEP_TYPES.filter(
      (b) =>
        b.label.toLowerCase().includes(query) ||
        b.id.toLowerCase().includes(query) ||
        b.description.toLowerCase().includes(query)
    );
    return { actions: filteredActions, builtins: filteredBuiltins };
  }, [actions, searchQuery]);

  const selectAction = (actionId: string) => {
    onUpdate({ type: "action", action: actionId, args: {} });
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const selectBuiltin = (builtinId: string) => {
    onUpdate({
      type: builtinId as WorkflowStep["type"],
      action: undefined,
      args: undefined,
      message: { type: "literal", value: "" },
    });
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const clearSelection = () => {
    onUpdate({ type: "action", action: undefined, args: {} });
  };

  const updateArg = (paramName: string, binding: ArgBinding) => {
    onUpdate({
      args: {
        ...step.args,
        [paramName]: binding,
      },
    });
  };

  const hasSelection = (step.type === "action" && step.action) || step.type !== "action";

  return (
    <div className="p-4 bg-bg-secondary rounded border border-border">
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <GripVertical size={16} className="text-text-muted cursor-grab" />
        </div>

        <div className="flex-1 space-y-3">
          {/* Step selector */}
          {!hasSelection || isSearchOpen ? (
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2 bg-bg-primary rounded border border-border">
                <Search size={16} className="text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchOpen(true)}
                  className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm"
                  placeholder="Search actions..."
                  autoFocus={!hasSelection}
                />
              </div>

              {isSearchOpen && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-bg-elevated border border-border rounded shadow-lg max-h-64 overflow-auto">
                  {/* Built-in types */}
                  {filteredItems.builtins.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-xs text-text-muted uppercase tracking-wide bg-bg-secondary">
                        Built-in
                      </div>
                      {filteredItems.builtins.map((builtin) => {
                        const Icon = builtin.icon;
                        return (
                          <button
                            key={builtin.id}
                            onClick={() => selectBuiltin(builtin.id)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-bg-secondary text-left"
                          >
                            <Icon size={16} className="text-text-muted" />
                            <div>
                              <div className="text-sm text-text-primary">{builtin.label}</div>
                              <div className="text-xs text-text-muted">{builtin.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {/* Actions */}
                  {filteredItems.actions.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-xs text-text-muted uppercase tracking-wide bg-bg-secondary">
                        Actions
                      </div>
                      {filteredItems.actions.map((action) => (
                        <button
                          key={action.id}
                          onClick={() => selectAction(action.id)}
                          className="w-full flex items-start gap-3 px-3 py-2 hover:bg-bg-secondary text-left"
                        >
                          <div className="w-4 h-4 rounded bg-accent-primary/20 flex items-center justify-center text-xs text-accent-primary mt-0.5">
                            {action.label[0]}
                          </div>
                          <div>
                            <div className="text-sm text-text-primary">{action.label}</div>
                            <div className="text-xs text-text-muted">{action.description}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}

                  {filteredItems.builtins.length === 0 && filteredItems.actions.length === 0 && (
                    <div className="px-3 py-4 text-sm text-text-muted text-center">
                      No matching actions found
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Selected action/builtin display */
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedBuiltin && (
                  <>
                    <selectedBuiltin.icon size={16} className="text-accent-primary" />
                    <span className="text-sm font-medium text-text-primary">{selectedBuiltin.label}</span>
                  </>
                )}
                {selectedAction && (
                  <>
                    <div className="w-5 h-5 rounded bg-accent-primary/20 flex items-center justify-center text-xs text-accent-primary">
                      {selectedAction.label[0]}
                    </div>
                    <span className="text-sm font-medium text-text-primary">{selectedAction.label}</span>
                    <span className="text-xs text-text-muted font-mono">{selectedAction.id}</span>
                  </>
                )}
              </div>
              <button
                onClick={clearSelection}
                className="text-text-muted hover:text-text-primary"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Parameters for action */}
          {selectedAction && selectedAction.params.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              {selectedAction.params.map((param) => (
                <ParamEditor
                  key={param.name}
                  param={param}
                  binding={step.args?.[param.name]}
                  inputFields={inputFields}
                  previousSteps={previousSteps}
                  onChange={(binding) => updateArg(param.name, binding)}
                />
              ))}
            </div>
          )}

          {/* Message input for builtin types */}
          {selectedBuiltin && (
            <div className="pt-2 border-t border-border">
              <label className="block text-xs text-text-muted mb-1">
                {step.type === "notify" && "Message"}
                {step.type === "log" && "Log message"}
                {step.type === "reject" && "Error message"}
                {step.type === "resolve" && "Output value"}
              </label>
              <input
                type="text"
                value={(step.message?.value as string) || ""}
                onChange={(e) =>
                  onUpdate({ message: { type: "literal", value: e.target.value } })
                }
                className="w-full px-3 py-2 bg-bg-primary rounded border border-border text-text-primary text-sm"
                placeholder={
                  step.type === "notify" ? "Notification message..." :
                  step.type === "log" ? "Log message..." :
                  step.type === "reject" ? "Error message..." :
                  "Return value..."
                }
              />
              {step.type === "notify" && (
                <div className="mt-2">
                  <label className="block text-xs text-text-muted mb-1">Variant</label>
                  <select
                    value={step.variant || "info"}
                    onChange={(e) => onUpdate({ variant: e.target.value as WorkflowStep["variant"] })}
                    className="px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
                  >
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onRemove}
          className="text-red-400 hover:text-red-300"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// Parameter Editor Component
interface ParamEditorProps {
  param: {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    options?: string[];
  };
  binding?: ArgBinding;
  inputFields: WorkflowInputField[];
  previousSteps: WorkflowStep[];
  onChange: (binding: ArgBinding) => void;
}

function ParamEditor({ param, binding, inputFields, previousSteps, onChange }: ParamEditorProps) {
  const bindingType = binding?.type || "literal";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
      <div className="sm:w-32 sm:shrink-0">
        <label className="text-xs text-text-muted">
          {param.name}
          {param.required && <span className="text-red-400">*</span>}
        </label>
        {param.description && (
          <div className="text-xs text-text-muted truncate" title={param.description}>
            {param.description}
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center gap-2">
        <select
          value={bindingType}
          onChange={(e) => {
            const newType = e.target.value as ArgBinding["type"];
            if (newType === "literal") {
              onChange({ type: "literal", value: "" });
            } else if (newType === "input") {
              onChange({ type: "input", path: inputFields[0]?.name || "" });
            } else if (newType === "step") {
              onChange({ type: "step", stepId: previousSteps[0]?.id || "", path: "" });
            }
          }}
          className="px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-xs"
        >
          <option value="literal">Value</option>
          <option value="input" disabled={inputFields.length === 0}>Input</option>
          <option value="step" disabled={previousSteps.length === 0}>Step</option>
        </select>

        {bindingType === "literal" && (
          param.type === "enum" && param.options ? (
            <select
              value={(binding?.value as string) || ""}
              onChange={(e) => onChange({ type: "literal", value: e.target.value })}
              className="flex-1 px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
            >
              <option value="">Select...</option>
              {param.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={param.type === "number" ? "number" : "text"}
              value={(binding?.value as string | number) ?? ""}
              onChange={(e) => onChange({ type: "literal", value: e.target.value })}
              className="flex-1 px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
              placeholder={param.description || param.name}
            />
          )
        )}

        {bindingType === "input" && (
          <select
            value={binding?.path || ""}
            onChange={(e) => onChange({ type: "input", path: e.target.value })}
            className="flex-1 px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
          >
            <option value="">Select input field...</option>
            {inputFields.map((field) => (
              <option key={field.name} value={field.name}>{field.label || field.name}</option>
            ))}
          </select>
        )}

        {bindingType === "step" && (
          <div className="flex-1 flex gap-1">
            <select
              value={binding?.stepId || ""}
              onChange={(e) => onChange({ type: "step", stepId: e.target.value, path: binding?.path || "" })}
              className="flex-1 px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
            >
              <option value="">Select step...</option>
              {previousSteps.map((s) => (
                <option key={s.id} value={s.id}>{s.action || s.type}</option>
              ))}
            </select>
            <input
              type="text"
              value={binding?.path || ""}
              onChange={(e) => onChange({ type: "step", stepId: binding?.stepId || "", path: e.target.value })}
              className="w-24 px-2 py-1 bg-bg-primary rounded border border-border text-text-primary text-sm"
              placeholder="path"
            />
          </div>
        )}
      </div>
    </div>
  );
}
