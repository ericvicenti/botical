# Architecture Decisions

This document tracks key architectural decisions for Botical.

---

## Decided

### 1. Mission Completion

**Decision:** Missions have a planning step with a markdown document that includes completion criteria. The agent drafts the plan and criteria, but the user must approve (and can edit) before the mission begins.

**Rationale:** This distinguishes missions from tasks:
- **Tasks**: Start immediately, no planning phase
- **Missions**: Require upfront planning, documented goals, clear success criteria

The planning document serves as:
1. A contract between user and agent
2. Documentation for what was attempted
3. Clear success/failure criteria
4. Context for the agent during execution

**Date:** 2025-01-15

---

### 2. Commands & Services (Not Terminals)

**Decision:** Replace "terminal" concept with **Commands** (short-lived) and **Services** (long-lived).

**Rationale:**
- **Commands**: Short-lived processes within tasks. Execute and complete.
- **Services**: Long-lived processes (dev servers, watchers, etc.) bound to project/task/mission lifecycle.

Lifecycle rules:
- Commands must live within a task context
- Services can live within project, task, or mission context
- Services terminate when their parent scope terminates
- Projects rarely terminate (can be archived)
- Tasks complete quickly (minutes)
- Missions complete within hours

Implementation note: The underlying PTY implementation is similar for both - the distinction is primarily UX. Interactive commands may run longer but are still conceptually "commands."

**Date:** 2025-01-15

---

### 3. Git Authentication

**Decision:** SSH keys configured on the Botical server. Users add the Botical public key to their GitHub/GitLab accounts.

**Rationale:**
- Simple to implement and understand
- No OAuth complexity for v1
- User controls access by adding/removing the key
- Future: Can add OAuth GitHub App later

Signature approach: Commits/actions by the agent should have a recognizable signature (author name, commit message prefix) so it's clear when Botical made a change.

**Date:** 2025-01-15

---

### 4. File Watching

**Decision:** Polling on demand (no native file watchers for v1).

**Rationale:**
- Most edits come from the agent and WebUI, so Botical is already aware
- Simpler implementation
- Lower resource usage
- Can add native watching later if needed

**Date:** 2025-01-15

---

### 5. Multi-User Commands & Services

**Decision:** Yes - all users can view and interact with all commands and services.

**Rationale:**
- Collaborative by default
- Users need visibility into what the agent is doing
- Multiple users might need to interact with a dev server
- Audit trail of who did what

**Date:** 2025-01-15

---

## Open Questions

*No open questions at this time.*
