# Plan: Convert Agent Tools to Iris Actions

## Overview

This plan outlines the migration from the current backend tool system to a unified Iris Actions architecture. The goal is to have a single abstraction that works for both:
1. **Agent Tools** - Operations the AI agent can perform
2. **UI Actions** - Operations users can trigger from the command palette or UI

## Current State

### Backend Tools (`src/tools/`)
| Tool | Category | Description |
|------|----------|-------------|
| `read` | filesystem | Read file contents |
| `write` | filesystem | Write/create files |
| `edit` | filesystem | Edit files with search/replace |
| `glob` | search | Find files by pattern |
| `grep` | search | Search file contents |
| `bash` | execution | Execute shell commands |
| `service` | execution | Manage background services |
| `task` | agent | Spawn sub-agents |
| `action` | action | Execute primitives (temporary) |

### Frontend Primitives (`webui/src/primitives/`)
- **Actions**: Operations with params and execute function (e.g., `git.create-commit`)
- **Pages**: UI surfaces with routes and components (e.g., `git.commit-view`)

## Target Architecture

### Unified Action System

```
┌─────────────────────────────────────────────────────────────┐
│                     Iris Actions Registry                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Action Definition                                   │    │
│  │  - id: string (e.g., "file.read", "git.commit")     │    │
│  │  - label: string                                     │    │
│  │  - description: string                               │    │
│  │  - params: Zod schema                                │    │
│  │  - execute: (params, context) => Promise<Result>     │    │
│  │  - surface: "agent" | "gui" | "both"                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
    ┌──────────────┐              ┌──────────────┐
    │  AI Agent    │              │  Command     │
    │  Tool Calls  │              │  Palette     │
    └──────────────┘              └──────────────┘
```

### Action Categories

1. **File Actions** (from filesystem tools)
   - `file.read` - Read file contents
   - `file.write` - Write/create file
   - `file.edit` - Edit file with search/replace
   - `file.delete` - Delete file
   - `file.move` - Move/rename file
   - `file.copy` - Copy file

2. **Search Actions** (from search tools)
   - `search.glob` - Find files by pattern
   - `search.grep` - Search file contents
   - `search.find` - Combined file/content search

3. **Shell Actions** (from execution tools)
   - `shell.run` - Execute command
   - `shell.spawn` - Run background process

4. **Service Actions** (from service tool)
   - `service.start` - Start a service
   - `service.stop` - Stop a service
   - `service.restart` - Restart a service
   - `service.status` - Get service status

5. **Git Actions** (new + existing)
   - `git.status` - Get repository status
   - `git.commit` - Create a commit
   - `git.push` - Push to remote
   - `git.pull` - Pull from remote
   - `git.branch` - Create/switch branch
   - `git.diff` - Show changes
   - `git.log` - Show commit history
   - `git.stash` - Stash changes

6. **Agent Actions** (from task tool)
   - `agent.spawn` - Create sub-agent
   - `agent.resume` - Resume agent session

7. **Project Actions**
   - `project.open` - Open a project
   - `project.create` - Create new project
   - `project.settings` - Open project settings

## Migration Phases

### Phase 1: Shared Action Registry (Week 1)
**Goal**: Create a unified action registry that works on both frontend and backend

1. Create shared action types in a common package
2. Define the `ActionDefinition` interface with all required fields
3. Create `ActionRegistry` class with register/get/execute methods
4. Support action filtering by surface (`agent`, `gui`, `both`)

### Phase 2: Migrate File Tools (Week 2)
**Goal**: Convert read/write/edit tools to actions

1. Create `file.read` action
   - Same functionality as current `read` tool
   - Add GUI support for "Open File" command

2. Create `file.write` action
   - Same functionality as current `write` tool
   - Add GUI support for "Create File" command

3. Create `file.edit` action
   - Same functionality as current `edit` tool
   - GUI: Could show diff preview before applying

4. Update agent orchestrator to use actions instead of tools

### Phase 3: Migrate Search Tools (Week 2)
**Goal**: Convert glob/grep to actions

1. Create `search.glob` action
2. Create `search.grep` action
3. Add GUI commands for quick search

### Phase 4: Migrate Execution Tools (Week 3)
**Goal**: Convert bash/service to actions

1. Create `shell.run` action
   - Replace bash tool
   - Add command history tracking

2. Create service actions
   - `service.start`, `service.stop`, `service.restart`
   - GUI: Service management panel

### Phase 5: Expand Git Actions (Week 3)
**Goal**: Full git integration via actions

1. Expand existing `git.commit` action
2. Add `git.push`, `git.pull`, `git.status`
3. Add `git.branch`, `git.diff`, `git.log`
4. GUI: All git operations via command palette

### Phase 6: Agent Actions (Week 4)
**Goal**: Convert task tool to actions

1. Create `agent.spawn` action (replaces task tool)
2. Create `agent.resume` action
3. Support different agent types via params

### Phase 7: Remove Legacy Tools (Week 4)
**Goal**: Clean up old tool system

1. Remove `src/tools/` directory
2. Update all imports to use actions
3. Remove tool-specific types
4. Update documentation

## Technical Details

### Action Definition Schema

```typescript
interface ActionDefinition<TParams extends z.ZodType> {
  // Identity
  id: string;                    // e.g., "file.read"
  label: string;                 // e.g., "Read File"
  description: string;           // For AI and UI

  // Parameters
  params: TParams;               // Zod schema

  // Execution
  execute: (
    params: z.infer<TParams>,
    context: ActionContext
  ) => Promise<ActionResult>;

  // Visibility
  surface: "agent" | "gui" | "both";
  category: ActionCategory;

  // Optional
  icon?: string;                 // Lucide icon name
  shortcut?: string;             // Keyboard shortcut
  when?: (ctx: ActionContext) => boolean;  // Conditional visibility
}

interface ActionContext {
  // For agent calls
  projectId: string;
  projectPath: string;
  sessionId?: string;
  messageId?: string;
  userId: string;
  abortSignal?: AbortSignal;

  // For GUI calls
  selectedProjectId?: string;
  navigate?: (opts: { to: string }) => void;
}

type ActionResult =
  | { type: "success"; output: string; metadata?: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "navigate"; pageId: string; params: Record<string, unknown> };
```

### Agent Tool Conversion

When the agent calls an action:

```typescript
// Old way (tool call)
{ name: "read", arguments: { path: "/src/index.ts" } }

// New way (action call)
{ name: "file.read", arguments: { path: "/src/index.ts" } }
```

The agent orchestrator converts actions to AI SDK tools:

```typescript
function actionsToTools(actions: ActionDefinition[]): ToolSet {
  const tools: ToolSet = {};

  for (const action of actions) {
    if (action.surface === "gui") continue; // Skip GUI-only actions

    tools[action.id] = {
      description: action.description,
      inputSchema: action.params,
      execute: async (args) => {
        const result = await action.execute(args, context);
        return result.type === "success" ? result.output : result.message;
      },
    };
  }

  return tools;
}
```

### GUI Integration

Actions are already integrated with the command palette via `primitive.commands.ts`. After migration:

1. All actions with `surface: "gui"` or `surface: "both"` appear in command palette
2. Actions can define custom forms via their Zod schema
3. Actions can navigate to pages on completion

## Benefits

1. **Single Source of Truth**: One place defines what operations are available
2. **Consistent API**: Same interface for agent and user operations
3. **Better Discovery**: Users can see all available operations in command palette
4. **Easier Testing**: Actions can be tested independently
5. **Type Safety**: Zod schemas ensure params are valid
6. **Extensibility**: Easy to add new actions

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking agent behavior | Keep tool names as aliases during migration |
| Performance regression | Benchmark before/after, optimize hot paths |
| Missing edge cases | Comprehensive test coverage for each action |
| API changes | Version the action API, support backwards compat |

## Success Metrics

- [ ] All tools converted to actions
- [ ] No regressions in agent capabilities
- [ ] All actions available in command palette
- [ ] Action execution time within 10% of tool execution
- [ ] 100% test coverage for action execute functions

## Next Steps

1. Review and approve this plan
2. Create the shared action registry
3. Start with Phase 2 (file tools) as proof of concept
4. Iterate based on learnings
