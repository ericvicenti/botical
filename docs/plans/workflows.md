# Workflows

## Overview

Workflows are composable sequences of actions that execute as a unit. They are essentially functions that can call multiple actions, with support for parallel execution, data flow between steps, and a visual DAG representation.

## Core Concepts

### Workflow Definition

A workflow is defined by:
- **ID**: Unique identifier (e.g., `workflow.deployToStaging`)
- **Label**: Human-readable name
- **Description**: What the workflow does
- **Input Schema**: Zod schema defining workflow arguments
- **Steps**: Array of action invocations with argument bindings
- **Output**: Optional output mapping from step results

### Steps

Each step in a workflow:
- **ID**: Unique within the workflow (e.g., `build`, `test`, `deploy`)
- **Action**: The action ID to invoke (e.g., `shell.run`, `git.commit`)
- **Args**: Argument bindings (see below)
- **DependsOn**: Array of step IDs that must complete first (defines DAG)
- **If**: Conditional expression - step only runs if evaluates to true
- **OnError**: Error handling strategy (`fail`, `continue`, `retry`)

### Built-in Step Types

Beyond action steps, workflows have built-in step types:

**Notify Step** - Show user feedback:
```typescript
{
  id: "notifyBuildComplete",
  type: "notify",
  message: { type: "literal", value: "Build complete!" },
  variant: "success",  // "info" | "success" | "warning" | "error"
}
```

**Resolve Step** - Complete workflow successfully with output:
```typescript
{
  id: "done",
  type: "resolve",
  output: {
    branch: { type: "step", stepId: "createBranch", path: "name" },
    sha: { type: "step", stepId: "commit", path: "sha" },
  },
}
```

**Reject Step** - Fail workflow with an error:
```typescript
{
  id: "validateEnv",
  type: "reject",
  if: { op: "truthy", value: { type: "step", stepId: "checkEnv", path: "missing" } },
  message: { type: "literal", value: "Missing required environment variables" },
}
```

**Log Step** - Log to workflow output:
```typescript
{
  id: "logResult",
  type: "log",
  message: { type: "step", stepId: "build", path: "output" },
}
```

### Argument Bindings

Step arguments can be sourced from three places:

```typescript
type ArgBinding =
  | { type: "literal"; value: unknown }           // Hardcoded value
  | { type: "input"; path: string }               // From workflow input
  | { type: "step"; stepId: string; path: string } // From previous step output
```

Examples:
```typescript
// Hardcoded
{ type: "literal", value: "npm test" }

// From workflow input
{ type: "input", path: "branch" }  // workflow.input.branch

// From previous step output
{ type: "step", stepId: "build", path: "outputDir" }  // steps.build.output.outputDir
```

### Conditional Expressions (If Statements)

Steps can have an `if` condition that determines whether they run:

```typescript
type ConditionExpression =
  | { op: "equals"; left: ArgBinding; right: ArgBinding }
  | { op: "notEquals"; left: ArgBinding; right: ArgBinding }
  | { op: "contains"; value: ArgBinding; search: ArgBinding }
  | { op: "exists"; value: ArgBinding }
  | { op: "truthy"; value: ArgBinding }
  | { op: "and"; conditions: ConditionExpression[] }
  | { op: "or"; conditions: ConditionExpression[] }
  | { op: "not"; condition: ConditionExpression }
```

Examples:
```typescript
// Only deploy to production if input.environment is "production"
{
  id: "deployProd",
  action: "shell.run",
  if: {
    op: "equals",
    left: { type: "input", path: "environment" },
    right: { type: "literal", value: "production" },
  },
  args: { ... }
}

// Only run if previous step succeeded and had changes
{
  id: "commit",
  action: "git.commit",
  if: {
    op: "and",
    conditions: [
      { op: "truthy", value: { type: "step", stepId: "checkChanges", path: "hasChanges" } },
      { op: "equals", value: { type: "step", stepId: "test", path: "status" }, right: { type: "literal", value: "success" } },
    ]
  },
  args: { ... }
}
```

### Error Handling

Steps can specify how to handle failures:

```typescript
interface WorkflowStep {
  // ... other fields
  onError?: {
    strategy: "fail" | "continue" | "retry";
    retryCount?: number;      // For retry strategy
    retryDelay?: number;      // ms between retries
    fallbackStepId?: string;  // Jump to this step on error
  };
}
```

**Strategies:**
- `fail` (default): Stop workflow immediately
- `continue`: Mark step as failed but continue other branches
- `retry`: Retry the step N times before failing

Example:
```typescript
{
  id: "deploy",
  action: "shell.run",
  args: { command: { type: "literal", value: "npm run deploy" } },
  onError: {
    strategy: "retry",
    retryCount: 3,
    retryDelay: 5000,
  },
}
```

### DAG (Directed Acyclic Graph)

The `dependsOn` field creates a DAG:
- Steps with no dependencies run immediately (in parallel if multiple)
- Steps wait for all dependencies to complete
- Circular dependencies are invalid (detected at definition time)

```
Example DAG for a deploy workflow:

    [checkout] ──┬──> [build] ──┬──> [deploy]
                 │              │
                 └──> [test] ───┘

checkout: no deps (runs first)
build, test: depend on checkout (run in parallel)
deploy: depends on build AND test (waits for both)
```

## Type Definitions

```typescript
import { z } from "zod";

// Argument binding types
type LiteralBinding = {
  type: "literal";
  value: unknown;
};

type InputBinding = {
  type: "input";
  path: string;  // dot-notation path into workflow input
};

type StepBinding = {
  type: "step";
  stepId: string;
  path: string;  // dot-notation path into step output
};

type ArgBinding = LiteralBinding | InputBinding | StepBinding;

// Step definition
interface WorkflowStep {
  id: string;
  action: string;  // Action ID to invoke
  args: Record<string, ArgBinding>;
  dependsOn?: string[];  // Step IDs
  condition?: string;    // Expression (future: proper expression language)
}

// Workflow definition
interface WorkflowDefinition<TInput extends z.ZodType = z.ZodType> {
  id: string;
  label: string;
  description: string;
  category: ActionCategory;
  icon?: string;

  input: TInput;
  steps: WorkflowStep[];

  // Map step outputs to workflow output
  output?: Record<string, StepBinding>;
}

// Runtime state for workflow execution
interface WorkflowExecution {
  id: string;
  workflowId: string;
  input: unknown;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";

  steps: Record<string, StepExecution>;

  startedAt: number;
  completedAt?: number;
  error?: string;
}

interface StepExecution {
  stepId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";

  // Resolved arguments (after binding evaluation)
  resolvedArgs?: Record<string, unknown>;

  // Action result
  result?: ActionResult;

  startedAt?: number;
  completedAt?: number;
  error?: string;
}
```

## Example Workflows

### 1. Simple Sequential Workflow

```typescript
const commitAndPush = defineWorkflow({
  id: "workflow.commitAndPush",
  label: "Commit and Push",
  description: "Stage all changes, commit, and push to remote",
  category: "git",
  icon: "git-commit",

  input: z.object({
    message: z.string().describe("Commit message"),
  }),

  steps: [
    {
      id: "stage",
      action: "git.stageAll",
      args: {},
    },
    {
      id: "commit",
      action: "git.commit",
      args: {
        message: { type: "input", path: "message" },
      },
      dependsOn: ["stage"],
    },
    {
      id: "push",
      action: "git.push",
      args: {},
      dependsOn: ["commit"],
    },
  ],
});
```

### 2. Parallel Workflow with Join

```typescript
const validateAndDeploy = defineWorkflow({
  id: "workflow.validateAndDeploy",
  label: "Validate and Deploy",
  description: "Run tests and lint in parallel, then deploy if both pass",
  category: "shell",
  icon: "rocket",

  input: z.object({
    environment: z.enum(["staging", "production"]).describe("Deploy target"),
  }),

  steps: [
    {
      id: "install",
      action: "shell.run",
      args: {
        command: { type: "literal", value: "npm install" },
      },
    },
    {
      id: "test",
      action: "shell.run",
      args: {
        command: { type: "literal", value: "npm test" },
      },
      dependsOn: ["install"],
    },
    {
      id: "lint",
      action: "shell.run",
      args: {
        command: { type: "literal", value: "npm run lint" },
      },
      dependsOn: ["install"],
    },
    {
      id: "build",
      action: "shell.run",
      args: {
        command: { type: "literal", value: "npm run build" },
      },
      dependsOn: ["test", "lint"],  // Waits for BOTH
    },
    {
      id: "deploy",
      action: "shell.run",
      args: {
        command: {
          type: "literal",
          value: "npm run deploy"
        },
        env: {
          type: "input",
          path: "environment",
        },
      },
      dependsOn: ["build"],
    },
  ],
});
```

### 3. Workflow with Conditionals, Toasts, and Error Handling

```typescript
const smartDeploy = defineWorkflow({
  id: "workflow.smartDeploy",
  label: "Smart Deploy",
  description: "Build, test, and deploy with environment-specific logic",
  category: "shell",
  icon: "rocket",

  input: z.object({
    environment: z.enum(["staging", "production"]),
    skipTests: z.boolean().default(false),
  }),

  steps: [
    // Notify start
    {
      id: "notifyStart",
      type: "notify",
      message: { type: "literal", value: "Starting deployment..." },
      variant: "info",
    },

    // Build step
    {
      id: "build",
      action: "shell.run",
      args: { command: { type: "literal", value: "npm run build" } },
      dependsOn: ["notifyStart"],
    },

    // Test step - conditional based on input
    {
      id: "test",
      action: "shell.run",
      args: { command: { type: "literal", value: "npm test" } },
      dependsOn: ["build"],
      if: {
        op: "not",
        condition: { op: "truthy", value: { type: "input", path: "skipTests" } },
      },
      onError: {
        strategy: "continue",  // Don't block deploy on test failure for staging
      },
    },

    // Reject if tests failed in production
    {
      id: "validateTests",
      type: "reject",
      dependsOn: ["test"],
      if: {
        op: "and",
        conditions: [
          { op: "equals", left: { type: "input", path: "environment" }, right: { type: "literal", value: "production" } },
          { op: "equals", left: { type: "step", stepId: "test", path: "status" }, right: { type: "literal", value: "failed" } },
        ],
      },
      message: { type: "literal", value: "Cannot deploy to production with failing tests" },
    },

    // Deploy with retry
    {
      id: "deploy",
      action: "shell.run",
      args: {
        command: { type: "literal", value: "npm run deploy" },
      },
      dependsOn: ["validateTests"],
      onError: {
        strategy: "retry",
        retryCount: 2,
        retryDelay: 3000,
      },
    },

    // Success notification
    {
      id: "notifySuccess",
      type: "notify",
      message: { type: "literal", value: "Deployment complete!" },
      variant: "success",
      dependsOn: ["deploy"],
    },
  ],
});
```

### 4. Data Flow Between Steps

```typescript
const createFeatureBranch = defineWorkflow({
  id: "workflow.createFeatureBranch",
  label: "Create Feature Branch",
  description: "Create branch, make initial commit, and push",
  category: "git",

  input: z.object({
    featureName: z.string().describe("Feature name (used for branch)"),
    description: z.string().describe("Feature description for initial commit"),
  }),

  steps: [
    {
      id: "createBranch",
      action: "git.createBranch",
      args: {
        name: { type: "input", path: "featureName" },
      },
    },
    {
      id: "createReadme",
      action: "file.write",
      args: {
        path: { type: "literal", value: "FEATURE.md" },
        content: { type: "input", path: "description" },
      },
      dependsOn: ["createBranch"],
    },
    {
      id: "commit",
      action: "git.commit",
      args: {
        message: { type: "literal", value: "feat: initial feature setup" },
      },
      dependsOn: ["createReadme"],
    },
    {
      id: "push",
      action: "git.push",
      args: {
        // Use branch name from createBranch output
        branch: { type: "step", stepId: "createBranch", path: "branch" },
        setUpstream: { type: "literal", value: true },
      },
      dependsOn: ["commit"],
    },
  ],

  output: {
    branch: { type: "step", stepId: "createBranch", path: "branch" },
    commitSha: { type: "step", stepId: "commit", path: "sha" },
  },
});
```

## Execution Engine

### Executor Flow

```
1. Validate workflow definition (no cycles, valid action refs)
2. Resolve input against schema
3. Build execution plan from DAG
4. Execute steps:
   a. Find all steps with satisfied dependencies
   b. Execute them in parallel
   c. Store results
   d. Repeat until all steps complete or one fails
5. Map outputs from step results
6. Return workflow result
```

### Execution Options

```typescript
interface WorkflowExecutionOptions {
  // Stop on first failure or continue other branches
  failFast?: boolean;  // default: true

  // Timeout for entire workflow
  timeout?: number;

  // Timeout per step (can be overridden per-step)
  stepTimeout?: number;

  // Dry run - validate and show plan without executing
  dryRun?: boolean;
}
```

## Integration Points

### 1. As Actions

Workflows register as actions, so they can be:
- Called by AI agents as tools
- Executed from command palette
- Composed into other workflows

```typescript
// Workflows automatically become actions
ActionRegistry.register(workflowToAction(commitAndPush));
```

### 2. WebSocket Events

Real-time updates during execution:
```typescript
// New event types
"workflow.started"
"workflow.step.started"
"workflow.step.completed"
"workflow.step.failed"
"workflow.completed"
"workflow.failed"
```

### 3. DAG Visualization

Frontend component to visualize workflow:
- Shows steps as nodes
- Arrows for dependencies
- Color-coded status (pending/running/completed/failed)
- Real-time updates during execution

## Storage

Workflows can be:
1. **Built-in**: Defined in code (like actions)
2. **User-defined**: Stored in project database

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  icon TEXT,
  input_schema TEXT NOT NULL,  -- JSON Zod schema
  steps TEXT NOT NULL,         -- JSON array
  output_schema TEXT,          -- JSON mapping
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

## Workflows as Actions

Every workflow automatically becomes an action. This means:

1. **AI agents** can call workflows as tools
2. **Command palette** shows workflows alongside actions
3. **Other workflows** can call workflows as steps (composition)

```typescript
// When a workflow is registered, it automatically creates an action
WorkflowRegistry.register(myWorkflow);

// Behind the scenes, this creates:
ActionRegistry.register({
  id: myWorkflow.id,  // "workflow.deployToStaging"
  label: myWorkflow.label,
  description: myWorkflow.description,
  params: myWorkflow.input,  // Workflow input becomes action params
  execute: (params, context) => WorkflowExecutor.run(myWorkflow, params, context),
});
```

The workflow's input schema becomes the action's params schema. The workflow's output becomes the action result.

## GUI Workflow Editor

A visual drag-and-drop editor for creating and editing workflows.

### Editor Components

```
┌─────────────────────────────────────────────────────────────────────┐
│  Workflow: Deploy to Staging                            [Save] [Run]│
├─────────────┬───────────────────────────────────────────────────────┤
│             │                                                       │
│  ACTIONS    │              DAG CANVAS                               │
│  ─────────  │                                                       │
│             │     ┌──────────┐                                      │
│  📁 File    │     │ checkout │──────┐                               │
│   • read    │     └──────────┘      │                               │
│   • write   │                       ▼                               │
│   • edit    │     ┌──────────┐  ┌──────────┐                        │
│             │     │  build   │  │   test   │                        │
│  🔧 Shell   │     └──────────┘  └──────────┘                        │
│   • run     │           │            │                              │
│   • spawn   │           └─────┬──────┘                              │
│             │                 ▼                                     │
│  📦 Git     │          ┌──────────┐                                 │
│   • commit  │          │  deploy  │                                 │
│   • push    │          └──────────┘                                 │
│   • status  │                                                       │
│             │                                                       │
│  🔄 Workflows│                                                      │
│   • deploy  │                                                       │
│   • test    │                                                       │
│             │                                                       │
├─────────────┴───────────────────────────────────────────────────────┤
│  STEP INSPECTOR: build                                              │
│  ───────────────────────────────────────────────────────────────────│
│  Action: shell.run                                                  │
│                                                                     │
│  Arguments:                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ command:  ○ Literal   ○ Input   ○ Step                      │   │
│  │           [npm run build                              ]      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Dependencies: [checkout]  [+ Add]                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Editor Features

**Left Panel - Action Palette**
- List of all available actions grouped by category
- Drag actions onto the canvas to create steps
- Search/filter actions
- Shows workflows too (for composition)

**Center - DAG Canvas**
- Visual representation of workflow steps
- Drag to reposition nodes
- Draw connections to set dependencies
- Click node to select and edit in inspector
- Visual feedback for valid/invalid connections
- Auto-layout option

**Bottom/Right - Step Inspector**
- Edit selected step's properties
- Configure argument bindings with UI:
  - **Literal**: Direct input field
  - **Input**: Dropdown of workflow input fields
  - **Step**: Dropdown of previous steps + output path
- Set dependencies (or draw on canvas)
- Condition expression (optional)

**Top Bar**
- Workflow metadata (name, description, icon)
- Save button
- Run button (execute workflow)
- Input schema editor

### Editor Interactions

**Adding Steps**
1. Drag action from palette to canvas
2. Or right-click canvas → "Add Step"
3. Step appears with default ID (editable)

**Connecting Steps (Dependencies)**
1. Drag from step's output port to another step's input port
2. Or select step → add dependency in inspector
3. Invalid connections (cycles) show red and reject

**Configuring Arguments**
1. Select step
2. Each action param shown in inspector
3. Toggle binding type (literal/input/step)
4. For step bindings, autocomplete shows available outputs

**Workflow Input Schema**
1. Click "Edit Inputs" in top bar
2. Add/remove/edit input fields
3. Set types (string, number, enum, etc.)
4. These become available for "input" bindings

### Canvas Rendering

Using a library like `reactflow` or custom SVG:

```typescript
interface CanvasNode {
  id: string;           // Step ID
  position: { x: number; y: number };
  data: {
    step: WorkflowStep;
    status?: StepExecutionStatus;  // For live execution view
  };
}

interface CanvasEdge {
  id: string;
  source: string;  // Step ID
  target: string;  // Step ID
}
```

### Live Execution View

When running a workflow, the same DAG canvas shows:
- Pending steps: Gray
- Running steps: Blue with spinner
- Completed steps: Green with checkmark
- Failed steps: Red with X
- Skipped steps: Gray with skip icon

Step inspector shows live output/logs for selected step.

## File Structure

```
src/workflows/
├── types.ts          # Type definitions
├── registry.ts       # WorkflowRegistry (like ActionRegistry)
├── executor.ts       # Workflow execution engine
├── dag.ts            # DAG utilities (validation, topological sort)
├── bindings.ts       # Argument binding resolution
├── index.ts          # Exports + built-in workflows
└── builtin/          # Built-in workflow definitions
    ├── git.ts
    └── dev.ts

webui/src/components/workflow/
├── WorkflowCanvas.tsx    # DAG canvas with nodes/edges
├── WorkflowNode.tsx      # Individual step node component
├── WorkflowEdge.tsx      # Dependency edge component
├── StepInspector.tsx     # Step configuration panel
├── ActionPalette.tsx     # Draggable action list
├── InputSchemaEditor.tsx # Workflow input configuration
├── BindingEditor.tsx     # Argument binding UI
├── WorkflowEditor.tsx    # Main editor combining all parts
└── WorkflowRunner.tsx    # Execution view with live status
```

## Implementation Plan

### Phase 1: Core Types & Registry
- [ ] Define TypeScript types in `src/workflows/types.ts`
  - WorkflowDefinition, WorkflowStep, ArgBinding
  - ConditionExpression for if statements
  - Built-in step types (notify, resolve, reject, log)
  - Error handling types
- [ ] Implement `WorkflowRegistry` in `src/workflows/registry.ts`
- [ ] DAG validation utilities in `src/workflows/dag.ts`

### Phase 2: Execution Engine
- [ ] Argument binding resolution in `src/workflows/bindings.ts`
- [ ] Condition expression evaluator in `src/workflows/conditions.ts`
- [ ] Workflow executor in `src/workflows/executor.ts`
  - Parallel step execution
  - Conditional step skipping
  - Error handling (fail/continue/retry)
  - Notify step (progress notifications)
  - Resolve/reject (complete or fail workflow)
- [ ] Integration with ActionRegistry (workflows become actions)

### Phase 3: WebSocket Integration
- [ ] Add workflow event types to protocol
  - workflow.started, workflow.completed, workflow.failed
  - workflow.step.started, workflow.step.completed, workflow.step.failed, workflow.step.skipped
  - workflow.notify (for progress notifications)
- [ ] Emit events during execution
- [ ] Frontend subscription

### Phase 4: DAG Visualization & Execution UI
- [ ] WorkflowCanvas component (DAG rendering)
- [ ] WorkflowNode component (step nodes)
- [ ] Real-time status updates during execution
- [ ] Step output/log viewer

### Phase 5: GUI Workflow Editor
- [ ] ActionPalette component (drag-and-drop actions)
- [ ] Canvas interactions (add/connect/delete nodes)
- [ ] StepInspector component (configure selected step)
- [ ] BindingEditor component (literal/input/step selector)
- [ ] ConditionEditor component (if statement builder)
- [ ] InputSchemaEditor component (workflow inputs)
- [ ] WorkflowEditor main component
- [ ] Save/load workflows

### Phase 6: Storage & API
- [ ] Database schema for user-defined workflows
- [ ] CRUD API endpoints
- [ ] Import/export workflows as JSON

### Phase 7: Built-in Workflows
- [ ] Git workflows (commit-push, feature-branch, etc.)
- [ ] Dev workflows (test-and-deploy, etc.)

## Open Questions

1. **Looping**: Should workflows support iteration over arrays? (e.g., deploy to multiple environments)
   - Could add a `forEach` step type that runs a sub-workflow for each item
2. **Approval Gates**: Should steps be able to pause for human approval?
   - Could add an `approval` step type that waits for user confirmation
3. **Timeouts**: Per-step timeouts? Workflow-level timeout?
4. **Variables**: Should workflows have mutable variables, or is step output sufficient?
5. **Parallel Limits**: Max concurrent steps? (avoid overwhelming system)

## References

- Actions system: `docs/knowledge-base/07-actions.md`
- Similar concepts: GitHub Actions, Temporal workflows, Airflow DAGs
