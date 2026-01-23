# Tools to Actions Migration - TODO

## Phase 1: Shared Action Registry ✅ COMPLETE

- [x] Create shared action types that work on both frontend and backend
- [x] Create ActionRegistry class with register/get/execute/list methods
- [x] Add `surface` field to actions: "agent" | "gui" | "both"
- [x] Update backend to use ActionRegistry for agent tools
- [ ] Update frontend primitives to use same ActionRegistry

## Phase 2: Migrate File Tools → File Actions ✅ COMPLETE

- [x] `file.read` - Read file contents
- [x] `file.write` - Write/create file
- [x] `file.edit` - Edit with search/replace
- [ ] Remove old read/write/edit tools (coexist for now)
- [ ] Add "Read File" and "Create File" to command palette

## Phase 3: Migrate Search Tools → Search Actions ✅ COMPLETE

- [x] `search.glob` - Find files by pattern
- [x] `search.grep` - Search file contents
- [ ] Remove old glob/grep tools (coexist for now)
- [ ] Add "Find Files" and "Search Code" to command palette

## Phase 4: Migrate Execution Tools → Shell Actions

- [ ] `shell.run` - Execute command (surface: agent)
- [ ] `shell.spawn` - Run background process (surface: both)
- [ ] Remove old bash tool
- [ ] Convert service tool to service actions

## Phase 5: Consolidate Git Actions ✅ MOSTLY COMPLETE

- [x] Move git_commit, git_status, git_diff, git_log to git.* namespace
- [x] Add `git.push` - Push to remote (surface: both)
- [x] Add `git.pull` - Pull from remote (surface: both)
- [x] Add `git.branch` - Create/switch branch (surface: both)
- [ ] Add `git.stash` - Stash changes (surface: both)
- [ ] Ensure all git actions work from command palette

## Phase 6: Agent Actions

- [ ] `agent.spawn` - Create sub-agent (surface: agent)
- [ ] `agent.resume` - Resume session (surface: both)
- [ ] Remove old task tool

## Phase 7: Cleanup

- [ ] Remove src/tools/ directory (or rename to src/actions/)
- [ ] Update all imports
- [ ] Update documentation
- [ ] Add tests for all actions

---

## Current Status

**Phases 1-3 Complete** - Core actions migrated

### Completed:

1. ✅ Created unified action system (types.ts, registry.ts)
2. ✅ Removed surface field - all actions are universal
3. ✅ Git actions: git.commit, git.status, git.diff, git.log
4. ✅ File actions: file.read, file.write, file.edit
5. ✅ Search actions: search.glob, search.grep
6. ✅ Orchestrator merges ActionRegistry + ToolRegistry tools
7. ✅ /api/tools/core includes both tools and actions

### Current Action Count: 9

- 4 git actions
- 3 file actions
- 2 search actions

### Next Steps:

1. Update frontend command palette to use ActionRegistry
2. Remove old file/search tools once frontend is updated
3. Consider shell actions (bash/service require special permissions)
