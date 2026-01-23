# Actions System

Actions are the unified interface for operations in Iris. They can be executed by:
- **AI Agents** - as tools during conversation
- **GUI** - via command palette (Cmd+K)
- **Tests** - programmatically for verification

This document covers how to define actions, handle results, and ensure good UX across all surfaces.

---

## Quick Start

### Defining an Action

```typescript
// src/actions/example.ts
import { z } from "zod";
import { defineAction, success, error } from "./types.ts";

export const myAction = defineAction({
  id: "example.myAction",
  label: "My Action",
  description: "Does something useful",
  category: "other",
  icon: "zap",

  params: z.object({
    name: z.string().describe("The name to use"),
    count: z.number().int().optional().describe("How many times"),
  }),

  execute: async ({ name, count = 1 }, context) => {
    // Do the work...
    return success("Completed", `Processed ${name} ${count} times`);
  },
});
```

### Registering Actions

```typescript
// src/actions/index.ts
import { ActionRegistry } from "./registry.ts";
import { myAction } from "./example.ts";

export function registerAllActions(): void {
  ActionRegistry.register(myAction);
}
```

---

## Action Definition

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier, use dot notation (e.g., `git.commit`) |
| `label` | `string` | Human-readable name for command palette |
| `description` | `string` | What the action does (shown in UI and to AI) |
| `category` | `ActionCategory` | Grouping: `git`, `file`, `search`, `shell`, `agent`, `other` |
| `icon` | `string` | Lucide icon name (e.g., `git-commit`, `file-text`) |
| `params` | `ZodSchema` | Zod schema defining input parameters |
| `execute` | `function` | Async function that performs the action |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `when` | `function` | Conditional availability based on context |

### Parameter Schema

Use Zod to define typed, validated parameters:

```typescript
params: z.object({
  // Required string
  message: z.string().min(1).describe("Commit message"),

  // Optional with default
  count: z.number().int().default(10).describe("Number of items"),

  // Enum (becomes select in UI)
  theme: z.enum(["dark", "light", "system"]).describe("Theme preference"),

  // Optional boolean
  force: z.boolean().optional().describe("Force operation"),
})
```

**Important**: Always add `.describe()` to parameters - this text appears as placeholder/help in the command palette.

### Parameter Names

Some parameter names are auto-filled from context and won't be prompted in the UI:
- `projectId` - Current project ID
- `sessionId` - Current session ID

---

## Result Types

Actions return one of four result types that determine how the UI responds:

### 1. Success Result

For operations that complete successfully with output.

```typescript
import { success } from "./types.ts";

// Success with title and output
return success("Commit created", "Created commit abc123 on branch main");

// Success with detailed output (shows dialog)
return success("Files found", fileList.join("\n"));

// Success with structured metadata
return success("Git Status", statusText, { branch: "main", ahead: 2 });
```

**Signature**: `success(title: string, output: string, metadata?: Record<string, unknown>)`

**UI Behavior**:
- Has output → Result dialog with scrollable content
- Output displayed in monospace font for readability

### 2. Error Result

For operations that fail.

```typescript
import { error } from "./types.ts";

// Simple error
return error("File not found");

// Error with details
return error(`Failed to commit: ${stderr}`);
```

**UI Behavior**:
- Short error (< 100 chars) → Toast notification (red)
- Long error → Result dialog with error styling

### 3. Navigate Result

For actions that should open a page/view.

```typescript
import { navigate } from "./types.ts";

// Navigate to a file
return navigate("file", { path: "/src/index.ts" });

// Navigate to a task/session
return navigate("task", { sessionId: "sess_abc123" });

// Navigate to settings
return navigate("settings", {});

// Navigate to a project
return navigate("project", { projectId: "proj_xyz" });
```

**UI Behavior**:
- Frontend handles routing based on `pageId`
- No toast/dialog shown

### 4. UI Result

For actions that modify UI state directly.

```typescript
import { ui } from "./types.ts";

// Change theme
return ui("setTheme", "dark", "Theme set to dark");

// Toggle sidebar
return ui("toggleSidebar", null, "Sidebar toggled");

// Change sidebar panel
return ui("setSidebarPanel", "git", "Showing git panel");

// Close tab
return ui("closeTab", "active");  // or specific tab ID

// Close all tabs
return ui("closeAllTabs", null, "All tabs closed");
```

**UI Behavior**:
- Action is performed immediately on frontend
- Message shown as toast if provided

---

## Execution Context

Actions receive context about the current environment:

```typescript
interface ActionContext {
  projectPath: string;    // Filesystem path to project root
  projectId?: string;     // Project ID if in project scope
  abortSignal?: AbortSignal;  // For cancellation support
}
```

### Using Context

```typescript
execute: async ({ path }, context) => {
  const fullPath = path.startsWith("/")
    ? path
    : join(context.projectPath, path);

  const content = await Bun.file(fullPath).text();
  return success("File read", content);
}
```

### Handling Cancellation

```typescript
execute: async ({ command }, context) => {
  const proc = spawn(command, {
    cwd: context.projectPath,
  });

  // Listen for abort
  context.abortSignal?.addEventListener("abort", () => {
    proc.kill("SIGTERM");
  });

  // ... rest of execution
}
```

---

## Conditional Availability

Use `when` to control when an action is available:

```typescript
export const gitCommit = defineAction({
  id: "git.commit",
  // ...

  when: (context) => {
    // Only available when in a project
    return !!context.projectId;
  },

  execute: async (params, context) => {
    // ...
  },
});
```

Actions with failing `when` conditions:
- Won't appear in command palette
- Won't be available as AI tools
- Return error if called directly

---

## Categories and Icons

### Categories

| Category | Description | Example Actions |
|----------|-------------|-----------------|
| `git` | Version control | commit, status, diff, log |
| `file` | File operations | read, write, edit |
| `search` | Find operations | glob, grep |
| `shell` | Command execution | run, spawn |
| `agent` | AI operations | task, newSession |
| `other` | Settings, UI | setTheme, toggleSidebar |

### Icons

Use [Lucide](https://lucide.dev/) icon names:

| Icon | Use For |
|------|---------|
| `git-commit` | Git commits |
| `git-branch` | Branch operations |
| `file-text` | Reading files |
| `file-plus` | Creating files |
| `file-edit` | Editing files |
| `folder-search` | File search (glob) |
| `search` | Content search (grep) |
| `terminal` | Shell commands |
| `play` | Starting services |
| `bot` | Agent tasks |
| `palette` | Theme/appearance |
| `panel-left` | Sidebar operations |

---

## Frontend Integration

### How Actions Become Commands

1. Backend registers actions via `ActionRegistry`
2. Frontend fetches from `/api/tools/actions`
3. `BackendActionsLoader` converts to Command format
4. Commands registered with `commandRegistry`
5. Command palette searches and displays

### Command Palette Flow

```
User opens palette (Cmd+K)
    ↓
Search filters commands
    ↓
User selects command
    ↓
If has args → Show form
If no args → Execute immediately
    ↓
POST /api/tools/actions/execute
    ↓
Backend executes action
    ↓
Returns result
    ↓
Frontend handles result:
  - success → toast or dialog
  - error → toast or dialog
  - navigate → route change
  - ui → direct state change
```

### Result Display Logic

```typescript
// In backend-actions.commands.ts

if (result.type === "success") {
  const output = result.output as string;

  if (output && output.length > 0) {
    // Any output → show in dialog for readability
    ctx.feedback.showResult(action.label, output, "success");
  } else if (result.message) {
    // Message only → toast
    ctx.feedback.showToast(result.message, "success");
  }
}

if (result.type === "error") {
  if (result.message.length < 100) {
    ctx.feedback.showToast(result.message, "error");
  } else {
    ctx.feedback.showResult(action.label, result.message, "error");
  }
}
```

---

## Agent Integration

### How Actions Become Tools

Actions are automatically converted to Vercel AI SDK tools:

```typescript
// In registry.ts
toAITools(context: ActionContext, options?: ToToolsOptions): ToolSet {
  const tools: ToolSet = {};

  for (const [id, registered] of this.actions) {
    // Convert dot notation to underscore (AI SDK compatibility)
    const toolName = id.replace(/\./g, "_");

    tools[toolName] = {
      description: def.description,
      inputSchema: def.params,
      execute: async (args) => {
        const result = await def.execute(args, context);

        // Convert result to string for AI
        if (result.type === "success") {
          return result.output || result.message;
        } else if (result.type === "error") {
          return `Error: ${result.message}`;
        }
        // ...
      },
    };
  }

  return tools;
}
```

### Agent-Friendly Results

When an action may be called by an agent, ensure the output is informative:

```typescript
// Good - agent can understand the result
return success(
  "Git status",
  `Branch: ${branch}\nAhead: ${ahead}\nBehind: ${behind}\n\nChanged files:\n${files.join("\n")}`
);

// Bad - agent gets no useful information
return success("Done");
```

---

## Testing Actions

### Unit Testing

```typescript
import { describe, it, expect } from "bun:test";
import { gitStatus } from "./git.ts";

describe("git.status", () => {
  it("returns repository status", async () => {
    const context = {
      projectPath: "/tmp/test-repo",
      projectId: "proj_test",
    };

    const result = await gitStatus.definition.execute({}, context);

    expect(result.type).toBe("success");
    expect(result.output).toContain("Branch:");
  });

  it("handles non-repo directory", async () => {
    const context = {
      projectPath: "/tmp/not-a-repo",
      projectId: "proj_test",
    };

    const result = await gitStatus.definition.execute({}, context);

    expect(result.type).toBe("error");
    expect(result.message).toContain("not a git repository");
  });
});
```

### Integration Testing

```typescript
import { ActionRegistry } from "./registry.ts";

describe("ActionRegistry", () => {
  beforeEach(() => {
    ActionRegistry.clear();
    registerAllActions();
  });

  it("executes action by ID", async () => {
    const result = await ActionRegistry.execute(
      "git.status",
      {},
      { projectPath: "/tmp/test-repo" }
    );

    expect(result.type).toBe("success");
  });

  it("validates parameters", async () => {
    const result = await ActionRegistry.execute(
      "git.commit",
      { message: "" },  // Invalid: empty message
      { projectPath: "/tmp/test-repo" }
    );

    expect(result.type).toBe("error");
    expect(result.message).toContain("Invalid params");
  });
});
```

---

## Best Practices

### 1. Clear Descriptions

```typescript
// Good - explains what and why
description: "Create a git commit with all staged and unstaged changes"

// Bad - too vague
description: "Commit changes"
```

### 2. Helpful Parameter Descriptions

```typescript
params: z.object({
  // Good - explains format and purpose
  pattern: z.string().describe("Glob pattern (e.g., **/*.ts, src/**/*.tsx)"),

  // Bad - obvious/unhelpful
  pattern: z.string().describe("The pattern"),
})
```

### 3. Informative Output

```typescript
// Good - structured, parseable output
return success("Search complete", [
  `Found ${results.length} matches`,
  "",
  ...results.map(r => `${r.file}:${r.line}: ${r.text}`),
].join("\n"));

// Bad - minimal output
return success("Done", `${results.length} results`);
```

### 4. Graceful Error Handling

```typescript
execute: async ({ path }, context) => {
  try {
    const content = await Bun.file(join(context.projectPath, path)).text();
    return success("File read", content);
  } catch (err) {
    if (err.code === "ENOENT") {
      return error(`File not found: ${path}`);
    }
    if (err.code === "EACCES") {
      return error(`Permission denied: ${path}`);
    }
    return error(`Failed to read file: ${err.message}`);
  }
}
```

### 5. Consistent Naming

```typescript
// Action IDs: category.verbNoun
"git.commit"
"git.status"
"file.read"
"file.write"
"search.glob"
"search.grep"
"settings.setTheme"
"view.openFile"
```

---

## File Structure

```
src/actions/
├── types.ts          # Type definitions, result helpers
├── registry.ts       # ActionRegistry singleton
├── index.ts          # Registration, exports
├── git.ts            # Git actions
├── file.ts           # File operations
├── search.ts         # Glob/grep
├── settings.ts       # UI settings
├── view.ts           # Navigation
├── shell.ts          # Command execution
└── agent.ts          # Sub-agent spawning
```

---

## Related Documents

- [Architecture](./01-architecture.md) - System overview
- [Patterns](./04-patterns.md) - Tool Definition Pattern (legacy)
- [API Reference](./03-api-reference.md) - REST endpoints
