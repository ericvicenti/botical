# SQLite to YAML Migration Plan

## Overview

Move configuration-like data from SQLite to human-readable YAML files in the project repository. This enables:
- Version control of workflows, services, and config
- Human editing without the UI
- Better collaboration and code review
- Simpler debugging

## What's Changing

### 1. DELETE: Permissions System (for now)

Remove entirely - will rethink later:
- `src/permissions/` directory
- `permissions` table from project DB
- Permission checking in tool execution

### 2. MIGRATE: Workflows → `.iris/workflows/*.yaml`

**Before (SQLite):**
```sql
workflows (id, project_id, name, label, description, category, icon, input_schema, steps, ...)
workflow_executions (...)
step_executions (...)
```

**After (YAML):**
```
.iris/
  workflows/
    deploy.yaml
    run-tests.yaml
    notify-team.yaml
```

**Example `deploy.yaml`:**
```yaml
name: deploy
label: Deploy to Production
description: Build and deploy the application
category: shell
icon: rocket

input:
  - name: environment
    type: enum
    label: Environment
    options: [staging, production]
    required: true

steps:
  - id: build
    type: action
    action: shell.run
    args:
      command: bun run build

  - id: deploy
    type: action
    action: shell.run
    args:
      command: ./deploy.sh {{ input.environment }}
    dependsOn: [build]

  - id: notify
    type: notify
    message: "Deployed to {{ input.environment }}"
    variant: success
    dependsOn: [deploy]
```

**Keep in SQLite:** `workflow_executions` and `step_executions` (runtime state)

### 3. MIGRATE: Services → `.iris/services/*.yaml`

**Before (SQLite):**
```sql
services (id, project_id, name, command, cwd, env, auto_start, enabled, ...)
```

**After (YAML):**
```
.iris/
  services/
    api-server.yaml
    postgres.yaml
    redis.yaml
```

**Example `api-server.yaml`:**
```yaml
name: api-server
command: bun run src/server/server.ts
cwd: .
autoStart: true
enabled: true

env:
  PORT: "3000"
  NODE_ENV: development
```

**Keep in SQLite:** `processes` and `process_output` (runtime state)

### 4. MIGRATE: Agents → `.iris/agents/*.yaml`

**Before (SQLite):**
```sql
agents (id, name, description, mode, provider_id, model_id, temperature, prompt, ...)
```

**After (YAML):**
```
.iris/
  agents/
    default.yaml
    code-review.yaml
    explorer.yaml
```

**Example `code-review.yaml`:**
```yaml
name: code-review
description: Reviews code for bugs and style issues
mode: subagent
hidden: false

model:
  provider: anthropic
  model: claude-sonnet-4-20250514
  temperature: 0.3

prompt: |
  You are a code reviewer. Focus on:
  - Potential bugs
  - Security issues
  - Performance problems
  - Code style consistency

tools:
  - read
  - glob
  - grep
```

### 5. KEEP: Plans (already files)

Plans already use `plan_path` pointing to markdown files. No change needed.

### 6. NEW: Project Config → `.iris/config.yaml`

**Single config file for project-wide settings:**
```yaml
# .iris/config.yaml
name: My Project
description: A cool project

defaults:
  model:
    provider: anthropic
    model: claude-sonnet-4-20250514

settings:
  autoStartServices: true
  theme: dark
```

## File Structure

```
project/
├── .iris/
│   ├── config.yaml           # Project settings
│   ├── agents/
│   │   ├── default.yaml
│   │   └── code-review.yaml
│   ├── services/
│   │   ├── api-server.yaml
│   │   └── database.yaml
│   ├── workflows/
│   │   ├── deploy.yaml
│   │   └── test.yaml
│   └── plans/                 # Already exists (markdown)
│       └── mission-abc.md
└── src/
    └── ...
```

## Implementation Tasks

### Phase 1: Delete Permissions
- [ ] Remove `src/permissions/` directory
- [ ] Remove `permissions` table from migration
- [ ] Remove permission checks from tool execution
- [ ] Update any imports/references

### Phase 2: YAML Infrastructure
- [ ] Add `js-yaml` or use Bun's built-in YAML parsing
- [ ] Create `src/config/yaml-loader.ts` for loading/saving YAML
- [ ] Create file watcher for hot-reload during development

### Phase 3: Migrate Workflows
- [ ] Create `WorkflowFileService` that reads from `.iris/workflows/`
- [ ] Update `WorkflowService` to use file-based storage
- [ ] Keep `workflow_executions` in SQLite for runtime state
- [ ] Update API routes to use new service
- [ ] Migration: export existing workflows to YAML files

### Phase 4: Migrate Services
- [ ] Create `ServiceFileService` that reads from `.iris/services/`
- [ ] Update `ServiceRunner` to use file-based config
- [ ] Keep `processes` table for runtime state
- [ ] Update API routes

### Phase 5: Migrate Agents
- [ ] Create `AgentFileService` that reads from `.iris/agents/`
- [ ] Update agent resolution to check files first
- [ ] Keep builtin agents in code
- [ ] Update API routes

### Phase 6: Project Config
- [ ] Create `ConfigService` for `.iris/config.yaml`
- [ ] Move relevant settings from SQLite
- [ ] Update project initialization

## API Changes

### Workflows API
- `GET /api/workflows` - reads from files
- `POST /api/workflows` - creates new YAML file
- `PUT /api/workflows/:id` - updates YAML file
- `DELETE /api/workflows/:id` - deletes YAML file
- `POST /api/workflows/:id/execute` - unchanged (runtime)

### Services API
- Same pattern as workflows

### File Sync
- Watch `.iris/` for changes
- Broadcast updates via WebSocket
- Handle conflicts (file changed while editing in UI)

## Migration Path

1. New projects: Use YAML from the start
2. Existing projects:
   - Run migration script to export SQLite → YAML
   - Keep SQLite tables for backwards compat temporarily
   - Remove SQLite tables in future version

## Questions to Resolve

1. **File naming**: Use `name` field or filename as ID?
   - Recommendation: filename is the ID (e.g., `deploy.yaml` → id: `deploy`)

2. **Validation**: When to validate YAML schema?
   - On load (fail fast)
   - On save via API (prevent invalid files)
   - Both

3. **Secrets in services**: How to handle env vars with secrets?
   - Option A: Reference env vars `$DATABASE_URL`
   - Option B: Separate `.iris/secrets.yaml` (gitignored)
   - Option C: Use system env vars only

4. **Workflow execution history**: Keep in SQLite or move to files?
   - Recommendation: Keep in SQLite (high-frequency writes, queries)
